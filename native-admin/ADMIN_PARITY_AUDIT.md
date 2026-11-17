# Native Admin parity audit

Audit basis: current `main` branch of `hamzawy-app` compared with the web administration console and backend routes in `hamzawy-backend-v2`.

## Confirmed web administration areas

The web console defines these 29 tabs:

1. Dashboard summary
2. Statistics
3. All clients
4. Client orders
5. All technicians
6. Pending technician approval
7. Technician profile edit requests
8. Disabled technicians
9. Levels and badges
10. Technician offers
11. Client wallets
12. Technician wallets
13. Wallet top-up requests
14. Subscription plans
15. Client subscriptions
16. Store management
17. Store orders and sales
18. Services
19. Service regions
20. Complaints
21. Support and violations
22. Notifications
23. Announcements and FAQs
24. Pricing and commissions
25. Reports
26. Page visits
27. Audit/security log
28. Platform settings
29. Admin roles and permissions


## Native Kotlin baseline

The native app currently declares 25 `AdminSection` entries. It has dedicated Compose handling for dashboard/statistics, page visits, reports, settings/pricing/content, technician wallet transactions, client and technician profile editing, password recovery, and support cases. Many remaining areas fall through to a shared generic `ListScreen`.

Existing native sections include orders, technicians, pending/disabled technicians, profile edits, levels, offers, technician wallets, top-ups, services, regions, complaints, support, recovery, notifications, content, pricing, reports, page visits, security, settings, roles, and clients.

## Confirmed functional gaps

### Missing native administration modules

- Store products and categories
- Store product media/image upload
- Store CSV bulk import
- Store advertisement settings, targeting, priority, and expiry
- Store orders and sales management
- Subscription plan catalog management
- Client subscription management (create, edit details, renew, status changes)
- Client wallet accounts and account selector
- Client wallet top-up review
- Client wallet add/deduct/set balance with reason and idempotency key
- Client wallet transaction ledger and refunds

The backend exposes these admin route families:
- `/api/admin/store/*`
- `/api/admin/commerce/*`
- `/api/admin/client-wallet/*`
- `/api/admin/clients/:id/wallet/*`

### Permission parity gaps

The web console uses separate permission keys for `commerce`, `store`, and `wallet` (client wallet). The native permission key list and path-to-permission mapping currently do not define the commerce and store keys or client-wallet-specific actions. These must be added consistently to section visibility, read checks, write checks, and action guards.

### Areas needing full workflow parity verification

The native app has a section or generic list for these areas, but a matching section title or API GET alone does not prove the full web workflow exists:
- technician and client administration
- order assignment, publishing, corrections, cancellation/refunds, bulk actions, voice review
- technician wallet adjustments, freeze/unfreeze, and ledger
- top-up approval/rejection
- service/category ordering and region bulk actions
- complaints, support violations, recovery requests
- notification history and sending
- content/FAQ editing
- pricing history and reports/export
- page visits, audit logs, admin user roles and granular permissions

Each action must be checked against its web counterpart, backend route, permission key, request payload, response refresh, validation, and error state before being marked complete.

## Firebase setup change

- Added `native-admin/app/google-services.json` with the matching `com.sonaa.nativeadmin` client.
- Added Google Services Gradle plugin `4.4.2` to the native-admin root and app module build scripts.
- A final APK build after all three commits is required; earlier successful builds do not validate the final combined configuration.

## Completion criteria

A module is complete only when:
1. Its native screen exposes the corresponding web operations and fields.
2. It calls the correct backend route and uses the correct HTTP method/payload.
3. Read/write permissions match the backend/web permission model.
4. Loading, empty, validation, success, and error states are handled.
5. Mutations refresh the correct data and preserve selection/context.
6. The Android build succeeds and the relevant workflow is tested.
