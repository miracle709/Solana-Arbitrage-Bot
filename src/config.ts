function readEnvString(key: string, fallback: string): string {
    const v = process.env[key];
    return v !== undefined && v !== "" ? v : fallback;
}

function readEnvInt(key: string, fallback: number): number {
    const raw = process.env[key];
    if (raw === undefined || raw === "") {
        return fallback;
    }
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
}

const defaultQuoteBase = "http://127.0.0.1:8080";
const jupiterBase = readEnvString("JUPITER_BASE_URL", defaultQuoteBase).replace(/\/$/, "");

export const config = {
    solanaRpcUrl: readEnvString("SOLANA_RPC_URL", "https://mainnet-ams.chainbuff.com"),
    jupiter: {
        quoteUrl: readEnvString("JUPITER_QUOTE_URL", `${jupiterBase}/quote`),
        swapInstructionUrl: readEnvString("JUPITER_SWAP_INSTRUCTIONS_URL", `${jupiterBase}/swap-instructions`),
    },
    jitoBundleUrl: readEnvString(
        "JITO_BUNDLE_URL",
        "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles"
    ),
    /** Jito tip recipient (one of the official Jito tip accounts) */
    jitoTipReceiver: readEnvString("JITO_TIP_PUBKEY", "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY"),
    wSolMint: "So11111111111111111111111111111111111111112",
    usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    tradeSizeLamports: readEnvInt("TRADE_SIZE_LAMPORTS", 10_000_000),
    minProfitLamports: readEnvInt("MIN_PROFIT_LAMPORTS", 3_000),
    pollIntervalMs: readEnvInt("POLL_INTERVAL_MS", 200),
    jitoTipFraction: 0.5,
    slippageBps: 0,
    maxAccounts: 20,
} as const;
