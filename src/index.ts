import "dotenv/config";
import { getKeypairFromEnvironment } from "@solana-developers/helpers";
import axios from "axios";
import bs58 from "bs58";
import {
    AddressLookupTableAccount,
    Connection,
    PublicKey,
    SystemProgram,
    VersionedTransaction,
    ComputeBudgetProgram,
    TransactionMessage,
    type TransactionInstruction,
} from "@solana/web3.js";
import { config } from "./config";
import { type JupiterQuote, toTransactionInstruction, type SwapInstructionsResponse } from "./types";

const payer = getKeypairFromEnvironment("SECRET_KEY");
console.log("payer:", payer.publicKey.toBase58());

const connection = new Connection(config.solanaRpcUrl, "processed");

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function buildQuoteParams(
    inputMint: string,
    outputMint: string,
    amount: number,
    inAmountForSecondLeg?: number
): Record<string, string | number | boolean> {
    const q: Record<string, string | number | boolean> = {
        inputMint,
        outputMint,
        amount: inAmountForSecondLeg !== undefined ? inAmountForSecondLeg : amount,
        onlyDirectRoutes: false,
        slippageBps: config.slippageBps,
        maxAccounts: config.maxAccounts,
    };
    return q;
}

function buildMergedQuote(
    quote0: JupiterQuote,
    quote1: JupiterQuote,
    baseAmount: number,
    jitoTip: number
): JupiterQuote {
    return {
        ...quote0,
        outputMint: quote1.outputMint,
        outAmount: String(baseAmount + jitoTip),
        otherAmountThreshold: String(baseAmount + jitoTip),
        priceImpactPct: "0",
        routePlan: [...(quote0.routePlan ?? []), ...(quote1.routePlan ?? [])],
    };
}

async function loadAddressLookupTableAccounts(
    addrs: string[]
): Promise<AddressLookupTableAccount[]> {
    const results = await Promise.all(
        addrs.map((address) => connection.getAddressLookupTable(new PublicKey(address)))
    );
    return results.map((r) => r.value).filter((a): a is AddressLookupTableAccount => a != null);
}

function assertSwapResponse(data: unknown): asserts data is SwapInstructionsResponse {
    const o = data as Record<string, unknown> | null;
    if (o == null) {
        throw new Error("swap-instructions: empty body");
    }
    if (typeof o.computeUnitLimit !== "number") {
        throw new Error("swap-instructions: missing computeUnitLimit");
    }
    if (!Array.isArray(o.setupInstructions) || o.swapInstruction == null) {
        throw new Error("swap-instructions: missing instructions");
    }
    if (!Array.isArray(o.addressLookupTableAddresses)) {
        throw new Error("swap-instructions: missing addressLookupTableAddresses");
    }
}

async function runOneCycle(): Promise<void> {
    const start = Date.now();
    const base = config.tradeSizeLamports;

    const quote0Params = buildQuoteParams(
        config.wSolMint,
        config.usdcMint,
        base
    );
    const { data: q0 } = await axios.get<JupiterQuote>(config.jupiter.quoteUrl, { params: quote0Params });
    const leg1Out = Number(q0.outAmount);
    if (!Number.isFinite(leg1Out) || leg1Out <= 0) {
        return;
    }

    const quote1Params = buildQuoteParams(config.usdcMint, config.wSolMint, base, leg1Out);
    const { data: q1 } = await axios.get<JupiterQuote>(config.jupiter.quoteUrl, { params: quote1Params });
    const leg2Out = Number(q1.outAmount);
    if (!Number.isFinite(leg2Out)) {
        return;
    }

    const diffLamports = leg2Out - base;
    console.log("diffLamports:", diffLamports);
    if (diffLamports <= config.minProfitLamports) {
        return;
    }

    const jitoTip = Math.floor(diffLamports * config.jitoTipFraction);
    const merged = buildMergedQuote(q0, q1, base, jitoTip);

    const swapData = {
        userPublicKey: payer.publicKey.toBase58(),
        wrapAndUnwrapSol: false,
        useSharedAccounts: false,
        computeUnitPriceMicroLamports: 1,
        dynamicComputeUnitLimit: true,
        skipUserAccountsRpcCalls: true,
        quoteResponse: merged,
    };

    const { data: swapInstructions } = await axios.post<unknown>(
        config.jupiter.swapInstructionUrl,
        swapData
    );
    assertSwapResponse(swapInstructions);
    const swap: SwapInstructionsResponse = swapInstructions;

    const ixs: TransactionInstruction[] = [];

    ixs.push(
        ComputeBudgetProgram.setComputeUnitLimit({
            units: swap.computeUnitLimit,
        })
    );

    ixs.push(
        ...swap.setupInstructions.map((raw) => toTransactionInstruction(raw))
    );

    ixs.push(toTransactionInstruction(swap.swapInstruction));

    ixs.push(
        SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: new PublicKey(config.jitoTipReceiver),
            lamports: jitoTip,
        })
    );

    const addressLookupTableAccounts = await loadAddressLookupTableAccounts(
        swap.addressLookupTableAddresses
    );

    const { blockhash } = await connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: blockhash,
        instructions: ixs,
    }).compileToV0Message(addressLookupTableAccounts);

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([payer]);

    const serializedTransaction = transaction.serialize();
    const base58Transaction = bs58.encode(serializedTransaction);

    const bundle = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: "sendBundle" as const,
        params: [[base58Transaction]] as [string[]],
    };

    const bundleResp = await axios.post<{ result?: string }>(config.jitoBundleUrl, bundle, {
        headers: { "Content-Type": "application/json" },
    });
    console.log(`sent to Jito, bundle id: ${bundleResp.data?.result}`);

    const end = Date.now();
    console.log(`${config.wSolMint} - ${config.usdcMint}`);
    console.log(
        `slot: ${String(merged.contextSlot)}, total duration: ${end - start}ms`
    );
}

async function main(): Promise<void> {
    for (;;) {
        try {
            await runOneCycle();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("cycle error:", msg);
        }
        await wait(config.pollIntervalMs);
    }
}

void main();
