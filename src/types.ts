import { PublicKey, TransactionInstruction, type AccountMeta } from "@solana/web3.js";

export interface RawInstruction {
    programId: string;
    accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
    data: string;
}

export interface SwapInstructionsResponse {
    computeUnitLimit: number;
    setupInstructions: RawInstruction[];
    swapInstruction: RawInstruction;
    addressLookupTableAddresses: string[];
}

export interface JupiterQuote {
    outputMint: string;
    outAmount: string;
    otherAmountThreshold?: string;
    priceImpactPct?: string;
    routePlan: unknown[];
    contextSlot?: number;
    [key: string]: unknown;
}

export function toTransactionInstruction(instruction: RawInstruction): TransactionInstruction {
    return new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: instruction.accounts.map(
            (account): AccountMeta => ({
                pubkey: new PublicKey(account.pubkey),
                isSigner: account.isSigner,
                isWritable: account.isWritable,
            })
        ),
        data: Buffer.from(instruction.data, "base64"),
    });
}
