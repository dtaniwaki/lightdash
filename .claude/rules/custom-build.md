# Custom Build

Base: origin/main = upstream/main (0.3428.0)
Date: 2026-07-22

Clean rebuild from upstream/main. `feat/chart-legend-labels` (fork#5) was rebased
onto 0.3428.0 (tip ed85069e02) to resolve its PR conflict; this rebuild merges that
rebased tip. Source tree verified byte-identical to the prior 0.3428.0 build
(2f0309401b) apart from TSOA regeneration ordering.

## Included branches / PRs

- allow-multi-databases (lightdash#20316) — feat: allow multiple Athena databases in a single project
- fix/db-connection-resilience (lightdash#20663) — fix: improve DB connection resilience with keepalive and scheduler retry
- feat/chart-level-color-palette (lightdash#20854) — feat: chart-level color palette override via eChartsConfig.colors
- fix/pivot-stacked-bar-color (lightdash#20855) — fix: prevent all series sharing same color in pivot stacked bar charts
- handle-already-invited-error (fork#1) — fix: throw AuthorizationError for pending OpenID signup without invite
- fix/build-relation-name-fallback (fork#3) — fix: build relation_name fallback when dbt ls does not populate it
- fix-my-athena-warehouse (fork#4) — fix(athena): Athena warehouse in My Warehouse Connections
- worktree-cached-honking-pebble (lightdash#25022) — feat: source filter-autocomplete labels from a dimension
- use-list-table-metadata-command (fork#2) — perf(athena): use ListTableMetadataCommand in getCatalog
- feat/chart-legend-labels (fork#5) — feat(charts): use filter_autocomplete.label_dimension for legend/tooltip/axis labels; incl. fix for pivoted/grouped legends (companion label carried on pivot column values)

## Conflict Resolutions

- `AthenaForm.tsx`: kept upstream's `description ?? fallback` prop-override mechanism with allow-multi-databases' updated "default schema name" fallback text.
- `EditCredentialsModal.tsx` / `getCredentialsWithPlaceholders.ts`: kept fix-my-athena-warehouse's extraction to its own module, and folded upstream's Redshift placeholder fields (accessKeyId/secretAccessKey/sessionToken) into the extracted module.
- `translator.test.ts`: upstream removed the `dbtMetrics` positional arg from `convertTable`; dropped the now-stale `[]` (dbtMetrics) argument from the branch-added tests (label-dimension + build-relation-name-fallback) so `spotlightConfig` lands at position 3.
- `AthenaWarehouseClient.test.ts`: replayed prior rerere resolution (allow-multi-databases + use-list-table-metadata-command both append describe blocks; kept both).
- `routes.ts` / `swagger.json`: regenerated via `generate-api` after all merges (includes `PivotValuesColumn.pivotValues[].label`).
