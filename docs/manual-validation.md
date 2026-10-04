# Required before release

## Read-only installed extension

- Load the built extension with Amazon.com access. Record Chrome version and build commit.
- Check dates persist across reload, settings round-trip, and clear-local-data behavior.
- Scan counts and every group's destination/items against Amazon. Confirm all carousel pages are covered and unavailable groups are explicit.
- Preview a trip spanning an actual delivery. Compare enabled candidates in Amazon, before/after options, month traversal, deadline and displayed savings. Preview must submit nothing.
- Check ordinary orders are explicitly not checked.

## Selected live change

Chris must select one existing group and a target date he actually wants. Review all products, displayed price/savings, current arrival and recurring frequency before clicking Apply.

- Execute through the installed extension, not browser automation substituting for it.
- Revisit Amazon and verify exact product membership at the new date; inspect ongoing schedule and savings/price consequences.
- If there is any unexpected consequence, hold release and resolve it without automatically rolling back.

## Bulk validation

Chris must select two real useful changes. Execute one reviewed multi-group run through the extension and independently verify both outcomes. If only one editable group is available, this gate remains pending; do not label bulk execution verified.

## Recovery

- Use synthetic fixtures for simulated CAPTCHA, tab closure, worker interruption before/after Confirm, second-group failure, merge and changed membership.
- Confirm replay cannot submit a duplicate change.
- Inspect the installed extension for service-worker and content-script errors.

## Publication

Only after the above passes: tag v0.1.0, publish the extension ZIP/checksum, update README from development status, and publish the site reference linking to source and release. Record exact evidence in Cross Context. No live tests in CI.

Current result: **pending installed-extension and live mutation validation**.
