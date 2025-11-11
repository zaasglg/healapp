# Карта сущностей и сценарий миграции на Supabase

## Основные таблицы
- `user_profiles` — расширение `auth.users`: роль пользователя, связи с организациями/клиентами.
- `organizations` — пансионаты, патронажные агентства и частные сиделки.
- `organization_employees` — сотрудники организаций, роли (`admin`, `manager`, `doctor`, `caregiver`).
- `clients` — владельцы карточек и дневников.
- `patient_cards` — карточки подопечных.
- `diaries` — дневники (активный только один на карточку).
- `diary_metrics`, `diary_metric_values`, `diary_history` — показатели и их история.
- `diary_employee_access` — доступ сотрудников патронажных агентств.
- `diary_client_links`, `diary_external_access_links` — приглашения клиентов и внешние ссылки.
- `invite_tokens` + специализированные таблицы — управление приглашениями (сотрудник, клиент, админ).
- `metric_catalog`, `medication_dictionary`, `vitamin_dictionary` — справочники.
- `activity_log`, `support_logs`, `dashboard_counters`, `diary_activity_snapshots` — админская аналитика и логи.

## Логика доступа
- RLS реализует матрицу из `docs/Роли и доступы.md`.
- Материализованные представления `admin_*` доступны только через service-role/Edge Functions.

## Переход на Supabase (Шаг 15.8)
1. Сохранить опциональный экспорт `localStorage` и очистить его (`docs/local_storage_cleanup.md`).
2. Запустить `scripts/seedSupabase.ts` (demodata) для проверки сценариев.
3. Smoke-тест: регистрация по приглашению, создание карточки/дневника, проверка прав доступа.

Документ использовать при подготовке backend и QA. README для запуска обновлён в `SETUP_INSTRUCTIONS.md`.
