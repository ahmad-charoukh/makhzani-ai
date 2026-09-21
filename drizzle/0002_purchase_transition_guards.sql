CREATE TRIGGER purchase_status_guard BEFORE UPDATE OF status ON purchases WHEN NEW.status != OLD.status BEGIN
 SELECT CASE WHEN NOT (
 (OLD.status='draft' AND NEW.status IN ('sent','cancelled')) OR
 (OLD.status='sent' AND NEW.status IN ('confirmed','cancelled')) OR
 (OLD.status='confirmed' AND NEW.status='cancelled' AND NOT EXISTS(SELECT 1 FROM purchase_items WHERE purchase_id=OLD.id AND received>0)) OR
 (OLD.status IN ('confirmed','partial') AND NEW.status='partial' AND EXISTS(SELECT 1 FROM purchase_items WHERE purchase_id=OLD.id AND received>0) AND EXISTS(SELECT 1 FROM purchase_items WHERE purchase_id=OLD.id AND received<quantity)) OR
 (OLD.status IN ('confirmed','partial') AND NEW.status='received' AND NOT EXISTS(SELECT 1 FROM purchase_items WHERE purchase_id=OLD.id AND received<quantity))
 ) THEN RAISE(ABORT,'stale purchase status') END;
END;
