export async function register() {
  // Only run in the Node.js runtime: this bootstrap pulls in Node-only modules
  // (crypto via the logger, dns/net via the SSRF guard) that cannot be bundled
  // for the Edge instrumentation runtime (audit O2).
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  try {
    const { initializeDisposableDomains } = await import("@/services/disposableChecker");
    await initializeDisposableDomains();
  } catch (error) {
    console.warn("[instrumentation] initializeDisposableDomains failed, continuing:", error);
  }
}
