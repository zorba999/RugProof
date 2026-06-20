# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

# Map human chain names -> chain id (used to query Sourcify for the
# verified on-chain source, no API key required).
CHAIN_IDS = {
    "ethereum": 1, "eth": 1, "mainnet": 1,
    "base": 8453,
    "bsc": 56, "binance": 56, "bnb": 56,
    "polygon": 137, "matic": 137,
    "arbitrum": 42161, "arb": 42161,
    "optimism": 10, "op": 10,
    "avalanche": 43114, "avax": 43114,
    "gnosis": 100,
    "celo": 42220,
}


class RugProof(gl.Contract):
    # contract_address (lowercased) -> verdict JSON string
    reports: TreeMap[str, str]

    def __init__(self):
        pass

    @gl.public.write
    def analyze(self, contract_address: str, github_url: str, chain: str) -> None:
        addr = contract_address.strip().lower()
        chain_key = chain.strip().lower()
        chain_id = CHAIN_IDS.get(chain_key, 1)
        gh_url = github_url.strip()
        sourcify_url = (
            "https://sourcify.dev/server/v2/contract/"
            f"{chain_id}/{contract_address.strip()}?fields=sources,compilation"
        )

        # Runs on leader AND validators. Gathers the two sources we compare.
        def gather() -> str:
            github_src = "[UNAVAILABLE]"
            try:
                r = gl.nondet.web.get(gh_url)
                github_src = r.body.decode("utf-8", errors="ignore")[:24000]
            except Exception as e:
                github_src = f"[FETCH FAILED: {e}]"

            onchain_src = "[NOT VERIFIED ON SOURCIFY]"
            try:
                r2 = gl.nondet.web.get(sourcify_url)
                onchain_src = r2.body.decode("utf-8", errors="ignore")[:24000]
            except Exception as e:
                onchain_src = f"[FETCH FAILED: {e}]"

            return (
                f"CONTRACT ADDRESS: {contract_address}\n"
                f"CHAIN: {chain_key} (id {chain_id})\n\n"
                f"===== SOURCE PUBLISHED ON GITHUB =====\n{github_src}\n\n"
                f"===== VERIFIED ON-CHAIN SOURCE (Sourcify) =====\n{onchain_src}\n"
            )

        task = (
            "You are a smart-contract security auditor specialized in detecting rug pulls and scams. "
            "You are given (1) the source a project PUBLISHES on GitHub and (2) the VERIFIED source "
            "actually deployed on-chain (from Sourcify), if it exists.\n\n"
            "Decide:\n"
            "1. MATCH: does the GitHub source match the deployed verified source? If the on-chain "
            "source is NOT verified, that is a serious risk (we cannot confirm what actually runs).\n"
            "2. Detect dangerous / rug-pull patterns in the DEPLOYED code: hidden mint, owner can "
            "drain funds, honeypot (can buy but not sell), arbitrary fee/tax setters, blacklist on "
            "transfer, pausable transfers, upgradeable proxy that lets the owner swap logic, ownership "
            "not renounced, external calls to attacker-controlled addresses, backdoors disguised as "
            "normal functions.\n\n"
            "Return ONLY a JSON object with EXACTLY these fields:\n"
            "{\n"
            '  "verdict": "SAFE" | "RISKY" | "SCAM",\n'
            '  "score": <integer 0-100, 0 = certain scam, 100 = clean>,\n'
            '  "source_match": "MATCH" | "MISMATCH" | "UNVERIFIED",\n'
            '  "flags": [<short strings, each a concrete risk found>],\n'
            '  "summary": "<2-3 sentence plain explanation for an investor>"\n'
            "}\n"
            "Be conservative: if you cannot verify the deployed code, the verdict must not be SAFE."
        )

        # Lenient, objective acceptance test. Validators only check that the
        # leader's answer is well-formed and plausible — NOT that the exact score
        # matches their own. Strict/subjective criteria here cause the consensus
        # to end UNDETERMINED on borderline contracts.
        criteria = (
            "Accept the answer as valid if ALL of the following hold: "
            "(1) it is a single well-formed JSON object; "
            "(2) 'verdict' is exactly one of SAFE, RISKY or SCAM; "
            "(3) 'score' is an integer from 0 to 100; "
            "(4) 'source_match' is one of MATCH, MISMATCH or UNVERIFIED; "
            "(5) 'flags' is a list and 'summary' is a non-empty string; "
            "(6) the verdict is a plausible security reading of the provided code. "
            "Do NOT require an exact score or wording — any reasonable assessment is acceptable. "
            "Only reject if the answer is malformed or clearly contradicts the provided source."
        )

        verdict = gl.eq_principle.prompt_non_comparative(
            gather,
            task=task,
            criteria=criteria,
        )

        self.reports[addr] = verdict

    @gl.public.view
    def get_report(self, contract_address: str) -> str:
        return self.reports.get(contract_address.strip().lower(), "")

    @gl.public.view
    def has_report(self, contract_address: str) -> bool:
        return self.reports.get(contract_address.strip().lower(), None) is not None
