-- Создаем уникальный индекс на diary_id для diary_client_links, если его нет
-- Это нужно для правильной работы upsert с onConflict

-- Проверяем, есть ли уже PRIMARY KEY на diary_id
DO $$
BEGIN
  -- Если PRIMARY KEY уже есть на diary_id, ничего не делаем
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conrelid = 'diary_client_links'::regclass 
    AND contype = 'p'
  ) THEN
    -- Если нет PRIMARY KEY, создаем уникальный индекс
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_indexes 
      WHERE tablename = 'diary_client_links' 
      AND indexname = 'diary_client_links_diary_id_unique'
    ) THEN
      CREATE UNIQUE INDEX diary_client_links_diary_id_unique 
      ON diary_client_links(diary_id);
    END IF;
  END IF;
END $$;

