export async function register() {
  try {
    const { initializeDisposableDomains } = await import("@/services/disposableChecker");
    await initializeDisposableDomains();
  } catch (error) {
    console.warn("[instrumentation] initializeDisposableDomains failed, continuing:", error);
  }
}
