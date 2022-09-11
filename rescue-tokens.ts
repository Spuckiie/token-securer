import { ethers, providers, Wallet, utils, Transaction } from "ethers";
import {
  FlashbotsBundleProvider,
  FlashbotsBundleResolution,
} from "@flashbots/ethers-provider-bundle";
import { exit } from "process";

const FLASHBOTS_URL = "https://relay.flashbots.net/";
const TOKEN_ADDRESS = "0xA8b12Cc90AbF65191532a12bb5394A714A46d358";

const main = async () => {
  if (
    process.env.SPONSOR_KEY === "SPONSOR_KEY" ||
    process.env.VICTIM_KEY === "VICTIM_KEY"
  ) {
    console.error("Please set both SPONSOR_KEY and VICTIM_KEY env");
    exit(1);
  }

  const provider = new providers.JsonRpcProvider(
    "https://rpc.flashbots.net/"
  );

  const authSigner = Wallet.createRandom();

  const flashbotsProvider = await FlashbotsBundleProvider.create(
    provider,
    authSigner,
    FLASHBOTS_URL
  );

  const sponsor = new Wallet(process.env.SPONSOR_KEY).connect(provider);
  const victim = new Wallet(process.env.VICTIM_KEY).connect(provider);

  const abi = ["function transfer(address,uint256) external"];
  const iface = new utils.Interface(abi);

  provider.on("block", async (blockNumber) => {
    console.log(blockNumber);
    const targetBlockNumber = blockNumber + 1;
    const resp = await flashbotsProvider.sendBundle(
      [
        {
          signer: sponsor,
          transaction: {
            chainId: 5,
            type: 2,
            to: victim.address,
            value: utils.parseEther("0.01"),
            maxFeePerGas: utils.parseUnits("3", "gwei"),
            maxPriorityFeePerGas: utils.parseUnits("2", "gwei"),
          },
        },
        {
          signer: victim,
          transaction: {
            chainId: 5,
            type: 2,
            to: TOKEN_ADDRESS,
            gasLimit: "50000",
            data: iface.encodeFunctionData("transfer", [
              sponsor.address,
              utils.parseEther("1000000"),
            ]),
            maxFeePerGas: utils.parseUnits("3", "gwei"),
            maxPriorityFeePerGas: utils.parseUnits("2", "gwei"),
          },
        },
      ],
      targetBlockNumber
    );

    if ("error" in resp) {
      console.log(resp.error.message);
      return;
    }

    const resolution = await resp.wait();
    if (resolution === FlashbotsBundleResolution.BundleIncluded) {
      console.log(`Congrats, included in ${targetBlockNumber}`);
      exit(0);
    } else if (
      resolution === FlashbotsBundleResolution.BlockPassedWithoutInclusion
    ) {
      console.log(`Not included in ${targetBlockNumber}`);
    } else if (resolution === FlashbotsBundleResolution.AccountNonceTooHigh) {
      console.log("Nonce too high, bailing");
      exit(1);
    }
  });
};

main();