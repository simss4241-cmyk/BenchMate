# Live BenchMate preview verification

Verified November 3, 2026 through the connected Chrome browser.

- Landing page: https://neuroforged.net/lab/benchmate/
- Standalone preview link is present: https://neuroforged.net/lab/benchmate/preview/
- Embedded YouTube video uses the correct `q9skyzp6COc` ID and custom cover.
- The static preview loads inside the production page with all four navigation tabs and both parent/preview sample-data/no-live-AI disclosures visible.
- Exercised the embedded production interaction: inspect the sample motors → reserve for Juno → confirm one unit → verify 3 reserved, 0 available, and a saved sample receipt.
- Reset afterwards: verified return to 2 reserved and 1 available. No real inventory or live-model request was involved.
- Screenshot: `data/preview-qa/live-embedded-preview.png`.

This verifies the deployed embedding and sample reservation flow. It is not a full production security audit, a separate signed-out session, or an official hackathon submission receipt.

Remaining work: review and publish current local app changes to the public repo; verify clean-checkout launch instructions; finish the actual event entry fields and links; perform final link/access review; submit and verify the receipt. The video and hosted static preview are complete.
