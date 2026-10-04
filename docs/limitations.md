# Limits and failure behavior

- Only exposed upcoming groups are scanned, at most 50 carousel pages. Empty/repeating pages and missing group details are incomplete coverage and block planning.
- Rescheduling may only be available for the earliest upcoming group. Future groups remain Needs attention.
- English point arrival dates only. Ambiguous/split arrival dates, malformed quantities, missing address/item count and duplicate item composites fail closed.
- Destination identity is a locally computed SHA-256 digest of the rendered address. The extension does not change destinations; select the correct digest and check the Amazon tab.
- A group is the unit of execution. Mixed per-item preferences require manual action. A group merged into another cannot be verified as exact membership and is left unknown.
- The review includes displayed savings/price-row text. It cannot infer prices or consequences Amazon does not display. Fresh changes to this text before submission invalidate the plan.
- The last edit day can expire at an unknown time; live reschedule availability is authoritative.
- Calendar traversal is bounded to 18 months and settings default to a 90-day horizon after the conflicting away range. No unavailable date is synthesized.
- Stop/closing the panel does not roll back an action already submitted. A timeout after Confirm is unknown; no automatic retry.
- No ordinary-order scan, checkout warning, carrier hold or delivery guarantee.
- The initial adapter has read-only live evidence; Apply all remains unreleased until extension-native live tests pass.
