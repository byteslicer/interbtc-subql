import type { AccountId } from "@polkadot/types/interfaces/runtime";
import { Vault } from "../types";

export async function ensureVault(vaultId: AccountId) {
  let id = vaultId.toHex();
  let data = await Vault.get(id);

  if (!data) {
    data = new Vault(id);
    await data.save();
  }

  return data;
}
