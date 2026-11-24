-- 배포 전 앱은 재조율할 때 시작만 해제한다. 종료도 함께 해제해
-- 기존 클라이언트와 새 종료 제약을 호환시키며, 확정·취소 기록은 보존한다.
CREATE FUNCTION clear_confirmed_end_on_reopen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.confirmed_end_at := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER clear_confirmed_end_on_reopen
BEFORE UPDATE OF confirmed_start_at ON promises
FOR EACH ROW
WHEN (OLD.confirmed_start_at IS NOT NULL AND NEW.confirmed_start_at IS NULL)
EXECUTE FUNCTION clear_confirmed_end_on_reopen();
