-- Custom SQL migration file, put your code below! --
-- Die Klartext-Namen der Auswertung „Geschäftsbereiche“ sind frei änderbar; jede Änderung steht im Änderungsprotokoll.
-- Wie bei jeder protokollierten Tabelle lehnt ein Trigger TRUNCATE ab (0201).
CREATE TRIGGER business_contact_names_audit AFTER INSERT OR UPDATE OR DELETE ON business_contact_names
  FOR EACH ROW EXECUTE FUNCTION haben_audit();
--> statement-breakpoint
CREATE TRIGGER business_contact_names_no_truncate BEFORE TRUNCATE ON business_contact_names
  FOR EACH STATEMENT EXECUTE FUNCTION haben_reject_truncate();
