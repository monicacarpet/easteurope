# Data initialization

## Pricing first

Do not reuse the bundled example values as commercial prices. Insert client-approved `stock_pricing_rules` rows with source, effective date, currency, tax, and freight conditions. Keep a rule inactive until its price has been approved.

The stock agent sends only rows with an active exact pricing rule and valid inventory status.

## Inventory

Use `templates/Stock_Upload_Template.xlsx` or the CSV version. The workbook contains no inherited inventory.

Required columns:

- `stock_market`
- `process_type`
- `sku`
- `specification`
- `area_m2`

Upload a complete inventory snapshot through **Stock → Stock data management**. Review row count, total area, warnings, and promotion eligibility before activation. An upload is a full replacement, not an incremental append. Validation failure leaves the previous snapshot active.

## Leads

Use `data/manual/leads_import_template.csv` as the contract. Production lead data should normally be imported with `src/supabase_client/upload_leads_to_supabase.py` or generated through the ETL pipeline. Preserve multiple contacts from the same company when they are distinct people; retain records with at least one valid phone or email route.

Never commit client lead records to the repository. Runtime lake CSV folders are ignored by Git.

## Acceptance sample

Before the full load, import a small client-approved test set and verify:

- role-scoped visibility;
- lead claiming/releasing;
- notes and follow-ups;
- GIS coordinates;
- inventory activation and audit history;
- pricing in RMB/USD/EUR where applicable;
- preview email facts, language, greeting, protected signature, and opt-out.

Delete or clearly mark test rows before enabling production sending.
