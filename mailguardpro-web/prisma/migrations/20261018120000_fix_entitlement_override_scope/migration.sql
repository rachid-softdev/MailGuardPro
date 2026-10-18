-- EntitlementOverride.scope_id is polymorphic: scope=USER → users.id, scope=ORG → organizations.id.
-- The original FK (20260629181837_add_feature_flags) only referenced organizations, so every
-- USER-scoped override write failed with a foreign key violation
-- ("Foreign key constraint violated on entitlement_overrides_scope_id_fkey").
-- The scope discriminator is enforced in the application layer (entitlementRepository);
-- drop the constraint so USER-scoped overrides can be persisted.
ALTER TABLE "entitlement_overrides" DROP CONSTRAINT "entitlement_overrides_scope_id_fkey";
