-- Monthly credit refills for paid plans.
--
-- `creditsResetAt` is the next time the plan allowance should be restored
-- (monthly, including for annual subscriptions). It is set at checkout and
-- advanced by the reset cron / invoice webhook. Existing paid users start with
-- NULL and are treated as due once by the reset cron.
ALTER TABLE "User" ADD COLUMN "creditsResetAt" TIMESTAMP(3);

CREATE INDEX "User_plan_creditsResetAt_idx" ON "User"("plan", "creditsResetAt");
