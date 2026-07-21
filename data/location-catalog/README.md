# Governed location catalog

Kelp's Student Signup and Profile use a server-imported country → state/region → city catalog. The browser receives only the next level after a user makes a selection; it never authors a timezone or downloads the full catalog.

## Current source

- Project: [Countries States Cities Database](https://github.com/dr5hn/countries-states-cities-database)
- Release: `v3.1-export.2`
- Asset: `json-countries+states+cities.json.gz`
- Expected path: `v3.1-export.2/json-countries+states+cities.json.gz`
- SHA-256: `315d33084e8bdd84948c9991840209fe4bcadc023912b5aac5428e28a0a2fb7b`
- License: Open Database License (ODbL); retain the upstream attribution and review production redistribution obligations before launch.

The bundle contains 250 countries, 5,296 states/regions, and 153,823 cities. City rows carry IANA timezone identifiers. The importer verifies the checksum, structure, unique provider IDs, and timezone values before allowing a local write.

## Local workflow

1. Apply pending Supabase migrations.
2. Run `npm run locations:inspect` for a read-only validation.
3. Run `npm run locations:import-local` to import only into the confirmed loopback Supabase project.

The import command refuses non-local API URLs and never prints the service-role key. Existing starter location keys remain stable so current Profile foreign keys do not break.
