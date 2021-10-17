import { SubstrateExtrinsic, SubstrateBlock } from "@subql/types";
import { Block } from "../types/models";
import { getBlockTimestamp } from "./utils/getBlockTimestamp";

export async function ensureBlock(block: SubstrateBlock) {
  const recordId = block.block.hash.toString();
  let data = await Block.get(recordId);

  if (!data) {
    data = new Block(recordId);

    await data.save();
  }

  return data;
}

export async function handleBlock(origin: SubstrateBlock): Promise<void> {
  const block = await ensureBlock(origin);

  const blockNumber = origin.block.header.number.toBigInt() || BigInt(0);
  const parentHash = origin.block.header.parentHash.toString();
  const stateRoot = origin.block.header.stateRoot.toString();
  const specVersion = origin.specVersion.toString();
  const extrinsicsRoot = origin.block.header.extrinsicsRoot.toString();
  const timestamp = getBlockTimestamp(origin.block);

  block.number = blockNumber;
  block.parentHash = parentHash;
  block.stateRoot = stateRoot;
  block.extrinsicRoot = extrinsicsRoot;
  block.specVersion = specVersion;
  block.timestamp = timestamp;

  await block.save();
}
