-- Custom SQL migration file, put your code below! --
-- Der Warenbestand der Auswertung „Geschäftsbereiche“ ist eine selbst gepflegte Liste und frei änderbar; jede Änderung
-- steht im Änderungsprotokoll. Wie bei jeder protokollierten Tabelle lehnt ein Trigger TRUNCATE ab (0201).
CREATE TRIGGER business_stock_items_audit AFTER INSERT OR UPDATE OR DELETE ON business_stock_items
  FOR EACH ROW EXECUTE FUNCTION haben_audit();
--> statement-breakpoint
CREATE TRIGGER business_stock_items_no_truncate BEFORE TRUNCATE ON business_stock_items
  FOR EACH STATEMENT EXECUTE FUNCTION haben_reject_truncate();
