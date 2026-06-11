# User & Auth — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/user/...`, `libs/session/...`, `libs/authentication/...`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Users are both website members and CMS editors; roles with permission IDs gate admin operations. Authentication is session-token based (email/password, JWT login links, optional TOTP 2FA) — there is no OAuth provider integration in the v2 API.

## Key types
**User** (public-safe, implements `BaseUser`) — `name!`, `firstName`, `flair`, `active!`, `image`, `properties!`, `roleIDs!`. No email exposed.

**SensitiveDataUser** (admin/self view) — adds `email!`, `emailVerifiedAt`, `pendingEmail`, `birthday`, `address: UserAddress`, `note`, `lastLogin`, `paymentProviderCustomers: [PaymentProviderCustomer!]`, `permissions: [String!]!`, `roles: [UserRole!]!`, `subscriptionCount!`, `totpEnabled!`, `totpExempt!`.

**UserAddress** — `company`, `streetAddress(+Number)`, `streetAddress2(+Number)`, `zipCode`, `city`, `country`; 1:1 with user in Prisma.

**UserRole** — `name!` (unique), `permissionIDs!`, `permissions!`, `systemRole!` (built-in roles not editable).

**SessionWithToken** — `token!`, `expiresAt!`, `totpEnabled!`, `user!`; `SessionWithTokenWithoutUser` used inside `Registration`.

**PaymentProviderCustomer** — `paymentProviderID!`, `customerID!` — maps the user to e.g. a Stripe customer for off-session charging.

**UserEvent** (enum) — `ACCOUNT_CREATION`, `PASSWORD_RESET`, `LOGIN_LINK`, `EMAIL_CHANGE`, `TEST_MAIL` (drives system mails).

## Key queries & mutations
Public (`@Public()`): `createSession(email, password, totpToken)`, `createSessionWithJWT(jwt, totpToken)`, `revokeActiveSession`, `sendWebsiteLogin(email)`, `sendPasswordResetEmail(email)`, `resetPasswordWithToken(password, token)`, `checkLoginOtp(email)`, `registerMember(...): Registration!`.
Authenticated self-service: `me`, `updateCurrentUser`, `updatePassword`, `requestEmailChange` / `confirmEmailChange`, `uploadUserProfileImage`, `generateTotpSetup`, `enableTotp`.
Admin: `user(id)` — `CanGetUser`; `users(filter…)` — `CanGetUsers`; `createUser(skipMail)`, `updateUser`, `resetPassword(id)` — all `CanCreateUser`; `deleteUser` — `CanDeleteUser`; `userRole(s)` — `CanGetUserRoles`/`CanGetUserRole`; `createUserRole`/`updateUserRole` — `CanCreateUserRole`; `deleteUserRole` — `CanDeleteUserRole`; `resetUserTotp(userId)` — `CanResetUserTotp`; `sendJWTLogin` — `CanSendJWTLogin`; `createJWTForUser` — `CanLoginAsOtherUser` (impersonation); `createJWTForWebsiteLogin` — `CanPreview`.

## Permissions
Constants verified in resolvers: `CanGetUser(s)`, `CanCreateUser`, `CanDeleteUser`, `CanGetUserRole(s)`, `CanCreateUserRole`, `CanDeleteUserRole`, `CanResetUserTotp`, `CanSendJWTLogin`, `CanLoginAsOtherUser`, `CanPreview`. Guards/decorators live in `libs/authentication/api/src/lib/` (`public.guard.ts`, `authenticated.guard.ts`).

## Gotchas
- Two GraphQL user types: comment authors etc. resolve to `User` (no email); `me`, `users`, and admin mutations return `SensitiveDataUser`. Never assume email is available on `User`.
- `updateUser` and `resetPassword(id)` are gated by `CanCreateUser`, not separate update constants.
- `checkLoginOtp` and `sendPasswordResetEmail`/`sendWebsiteLogin` always return success-shaped values to prevent account enumeration.
- Email change is two-step: `requestEmailChange` stores `pendingEmail` + sends a confirmation link; `confirmEmailChange` finalizes.
- TOTP: `SessionWithToken.totpEnabled` tells the client to verify TOTP for admins; `totpExempt` opts a user out.
- No OAuth: passwordless login is via emailed JWT links (`sendWebsiteLogin` → `createSessionWithJWT`).

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma`
- `libs/user/api/src/lib/{user,user-role,profile}.resolver.ts`
- `libs/session/api/src/lib/{session,register,totp}.resolver.ts`, `libs/authentication/api/src/lib/`
