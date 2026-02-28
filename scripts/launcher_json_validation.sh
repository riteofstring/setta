#!/usr/bin/env bash

_validate_launcher_json_with_perl() {
  local mode="${1-}"
  local raw_json="${2-}"

  if ! command -v perl >/dev/null 2>&1; then
    echo "Perl is required to validate launcher JSON payloads." >&2
    return 1
  fi

  if [[ "${mode}" == "setup" ]]; then
    perl -MJSON::PP -e '
use strict;
use warnings;

my $raw = shift @ARGV;
my $payload;
eval { $payload = JSON::PP->new->decode($raw); 1 } or do {
  print STDERR "setta launcher setup returned invalid JSON.\n";
  exit 1;
};
if (ref($payload) ne "HASH") {
  print STDERR "setta launcher setup did not return a successful JSON payload.\n";
  exit 1;
}
my $ok = $payload->{ok};
if (!JSON::PP::is_bool($ok) || !$ok) {
  print STDERR "setta launcher setup did not return a successful JSON payload.\n";
  exit 1;
}
my $metadata_path = $payload->{metadataPath};
if (!defined($metadata_path) || ref($metadata_path) ne q{} || $metadata_path !~ /\S/) {
  print STDERR "launcher setup payload is missing metadataPath.\n";
  exit 1;
}
my $target_command = $payload->{targetCommand};
if (ref($target_command) ne "ARRAY" || scalar(@{$target_command}) == 0) {
  print STDERR "launcher setup payload is missing targetCommand.\n";
  exit 1;
}
for my $segment (@{$target_command}) {
  if (!defined($segment) || ref($segment) ne q{} || $segment eq q{}) {
    print STDERR "launcher setup payload contains an invalid targetCommand segment.\n";
    exit 1;
  }
}
' "${raw_json}"
    return $?
  fi

  if [[ "${mode}" == "remove" ]]; then
    perl -MJSON::PP -e '
use strict;
use warnings;

my $raw = shift @ARGV;
my $payload;
eval { $payload = JSON::PP->new->decode($raw); 1 } or do {
  print STDERR "setta launcher remove returned invalid JSON.\n";
  exit 1;
};
if (ref($payload) ne "HASH") {
  print STDERR "setta launcher remove did not return a successful JSON payload.\n";
  exit 1;
}
my $ok = $payload->{ok};
if (!JSON::PP::is_bool($ok) || !$ok) {
  print STDERR "setta launcher remove did not return a successful JSON payload.\n";
  exit 1;
}
my $metadata_removed = $payload->{metadataRemoved};
if (!JSON::PP::is_bool($metadata_removed)) {
  print STDERR "launcher remove payload is missing metadataRemoved.\n";
  exit 1;
}
my $removed_paths = $payload->{removedPaths};
if (ref($removed_paths) ne "ARRAY") {
  print STDERR "launcher remove payload is missing removedPaths.\n";
  exit 1;
}
for my $removed_path (@{$removed_paths}) {
  if (!defined($removed_path) || ref($removed_path) ne q{}) {
    print STDERR "launcher remove payload contains an invalid removedPaths entry.\n";
    exit 1;
  }
}
my $missing_paths = $payload->{missingPaths};
if (ref($missing_paths) ne "ARRAY") {
  print STDERR "launcher remove payload is missing missingPaths.\n";
  exit 1;
}
for my $missing_path (@{$missing_paths}) {
  if (!defined($missing_path) || ref($missing_path) ne q{}) {
    print STDERR "launcher remove payload contains an invalid missingPaths entry.\n";
    exit 1;
  }
}
' "${raw_json}"
    return $?
  fi

  echo "Unknown launcher JSON validation mode: ${mode}" >&2
  return 1
}

validate_launcher_setup_json_payload() {
  local raw_json="${1-}"
  _validate_launcher_json_with_perl "setup" "${raw_json}"
}

validate_launcher_remove_json_payload() {
  local raw_json="${1-}"
  _validate_launcher_json_with_perl "remove" "${raw_json}"
}
