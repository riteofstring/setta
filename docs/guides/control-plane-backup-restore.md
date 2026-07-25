# Control-plane backup and restore

The control-plane backup is an operator recovery artifact for the SQLite
authority and its database-referenced runtime credentials. It is not the
user-project export format and does not replace the encrypted off-provider
backup work in Phase 7.

## Backup

Stop `setta-control-plane serve` before running the backup command. The command
checks the administration socket and refuses to run while the serving process
is reachable.

```sh
setta-control-plane backup \
  --data-dir /absolute/control-plane-data \
  --secret-dir /absolute/runtime-secrets \
  --output-dir /absolute/new-backup-directory
```

The output directory must not exist. The command creates it with mode `0700`,
uses SQLite's snapshot operation so WAL state is included, and writes:

- `control-plane.sqlite`, mode `0600`;
- `runtime-secrets/*.secret`, mode `0600`, for the exact sorted set of secret
  references present in the database snapshot; and
- `manifest.json`, mode `0600`, written last with the control-plane schema
  version and SHA-256 checksum for every retained file.

An unreferenced or stale secret is not copied. A referenced secret that is
missing, invalid, or not a private regular file fails the backup and prevents
the manifest from being written.

The backup contains plaintext runtime credentials inside a private directory.
Keep it on an encrypted operator-controlled volume and apply the same access
policy as the serving secret store. The checksums detect accidental corruption
and inconsistent copies; they do not authenticate a backup supplied by an
untrusted party.

## Restore

Restore only into absent data and secret directories:

```sh
setta-control-plane restore \
  --backup-dir /absolute/control-plane-backup \
  --data-dir /absolute/new-control-plane-data \
  --secret-dir /absolute/new-runtime-secrets
```

Before creating either destination, restore rejects symlinks, non-private
backup files, unknown or duplicate manifest fields, unsupported schema
versions, unsorted or duplicate secret references, extra or missing files,
invalid credentials, and checksum mismatches. It then copies files with
`0600` permissions, opens the restored SQLite authority through the production
schema validator, verifies that its secret-reference set exactly matches the
manifest, and reads every restored credential through the production secret
store.

Restore never overwrites an existing directory. If an I/O failure occurs after
destination creation, the incomplete destination remains visibly incomplete;
move it to Trash before retrying with new destination paths.

## Availability boundary

Backup and restore preserve volume-loss recovery material, but do not provide
automatic failover, replication, point-in-time recovery, or secret-store
encryption independent of the operator volume. The serving topology remains
one control-plane process on one durable volume. A production beta still needs
an encrypted off-volume backup schedule, retention policy, restore ownership,
and a measured recovery-time objective.
