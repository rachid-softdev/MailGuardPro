export async function register() {
  const { initializeDisposableDomains } = await import("@/services/disposableChecker");
  await initializeDisposableDomains();
}
