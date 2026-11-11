-- Custom SQL migration file, put your code below! --
-- Geschäftsbereiche, ihre Regeln und die Zuordnungen von Hand sind Einstellungen einer Auswertung und frei änderbar;
-- jede Änderung steht im Änderungsprotokoll. Wie bei jeder protokollierten Tabelle lehnt ein Trigger TRUNCATE ab (0201).
CREATE TRIGGER business_areas_audit AFTER INSERT OR UPDATE OR DELETE ON business_areas
  FOR EACH ROW EXECUTE FUNCTION haben_audit();
--> statement-breakpoint
CREATE TRIGGER business_area_rules_audit AFTER INSERT OR UPDATE OR DELETE ON business_area_rules
  FOR EACH ROW EXECUTE FUNCTION haben_audit();
--> statement-breakpoint
CREATE TRIGGER business_area_assignments_audit AFTER INSERT OR UPDATE OR DELETE ON business_area_assignments
  FOR EACH ROW EXECUTE FUNCTION haben_audit();
--> statement-breakpoint
CREATE TRIGGER business_areas_no_truncate BEFORE TRUNCATE ON business_areas
  FOR EACH STATEMENT EXECUTE FUNCTION haben_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER business_area_rules_no_truncate BEFORE TRUNCATE ON business_area_rules
  FOR EACH STATEMENT EXECUTE FUNCTION haben_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER business_area_assignments_no_truncate BEFORE TRUNCATE ON business_area_assignments
  FOR EACH STATEMENT EXECUTE FUNCTION haben_reject_truncate();
