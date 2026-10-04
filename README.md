# Away Mode

A personal Chrome extension for moving Amazon Subscribe & Save deliveries around days away from home. Local settings, no backend, no paid service.

**Development status:** the extension builds and has synthetic test coverage. Live Apply all validation is pending. There is no published release yet. Do not rely on this development build to protect a trip.

## Build and install for validation

Requires Node.js 24+ and Chrome 116+.

```sh
npm ci
npm run typecheck
npm test
npm run test:integration
npm run build
```

Open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select this repository's `dist` directory. Pin Away Mode and click its toolbar icon to open the side panel. Use Chrome's Reload button after rebuilding; reload Amazon too. `npm run dev` watches TypeScript changes; rebuild for changes to HTML, CSS or the manifest.

## Prepare a trip

1. Add the dates when you cannot receive packages. Both endpoints are inclusive: away October 10–17 means October 18 is the first acceptable return delivery day.
2. Click **Check deliveries**. Away Mode opens one dedicated Amazon.com tab. Sign in yourself if needed, then retry. It reads the upcoming delivery carousel and each exposed group's detail page, including a destination fingerprint and all products.
3. Choose the home destination. Address text is hashed locally and is not saved. Destination labels use hash prefixes; match the address shown in the Amazon tab when reviewing.
4. Click **Review proposed moves**. Away Mode inspects Amazon's actual enabled dates, up to 90 days after the last overlapping away range. Select after return or before departure per group; exclude any groups you do not want to move.
5. Review product membership, current savings, deadline, old date and proposed date. **The entire group moves together.** A per-item split is a manual exception. Missing information or unavailable rescheduling is Needs attention.
6. Click **Apply all selected changes**. Keep the panel and working tab open. Each selected move is freshly checked, submitted once, then checked by rescanning Amazon. Completed results survive a later failure.

Only the next delivery is moved. Recurring preferences are not edited. Arrival estimates can change later. "No conflicts found in the deliveries checked" refers to the displayed scan coverage and timestamp, never a guarantee that no package will arrive.

## Recovery

Closing the panel stops before the next write; it does not undo completed changes. Closing the working tab or a worker interruption can leave an **Outcome unknown**. Reopen Away Mode and use **Reconcile interrupted results**. An exact match at the target is verified; an exact unchanged group can be reviewed in a new plan. Ambiguous membership, merged groups, incomplete scans and uncertain outcomes block additional writes. Check Amazon manually if reconciliation cannot resolve them.

No automatic rollback or automatic restart. No background monitoring when Chrome is closed. An extension update cannot undo Amazon changes.

## Data and permissions

Settings export/import contains away dates, destination fingerprint and calendar horizon only. Clear local data deletes settings, scans and results after unknown outcomes are reconciled. Recent scans and the most recent run stay in Chrome local extension storage, replacing earlier runs. They contain product titles, quantities, displayed savings and management links, so treat this device's extension storage as private.

Permissions are `storage`, `sidePanel` and Amazon.com host access. Content scripts run only on `/auto-deliveries*`. No cookies, credentials, analytics, remote runtime code, private Amazon API calls or third-party runtime libraries. All product logic is bundled locally. Amazon naturally receives its own navigation and rescheduling requests.

## Limits

English Amazon.com desktop Subscribe & Save only. Ordinary orders are not checked. No purchasing, skipping, cancellation, address changes, frequency changes, calendar OAuth, mobile interception or Chrome Web Store listing. The scanner reads actual exposed groups rather than inventing shipments from recurring frequencies. Changed UI, login, CAPTCHA, unknown dates or mismatched membership stop the operation.

Amazon currently exposes Reschedule for some groups but not all future groups. The adapter uses rendered title/image/quantity composites because stable subscription IDs were not available on the observed tiles. Duplicate composites are blocked. See [limitations](docs/limitations.md) and [live validation checklist](docs/manual-validation.md).

## Release

`npm run package` creates a development ZIP plus SHA-256 checksum in `artifacts/`. Publishing a release requires the live validation checklist, including single-group and multi-group runs performed through the extension. The repository may be public while the release is held.
