# Сценарии аутентификации и заполнения профилей

## Edge Function — что делает `accept-invite`
Edge Function Supabase — небольшая серверная функция (Deno/TypeScript), которая выполняется рядом с базой и может использовать сервисные ключи. Наша функция `accept-invite`:
- проверяет токен приглашения (сотрудник/клиент);
- создает пользователя в `auth.users` через `auth.admin.createUser` и ставит `email_confirm = true`, `phone_confirm = true` (без OTP);
- если реального email нет, генерирует псевдо-email `employee-7999...@diary.local` на основе номера телефона;
- записывает профиль в `user_profiles` и таблицы домена (`organization_employees` или `clients`);
- привязывает карточку/дневник (для приглашенных клиентов организаций);
- помечает токен использованным;
- логинит пользователя (`auth.signInWithPassword`) и возвращает в ответе `access_token`, `refresh_token`, `expires_in`, `token_type`.

> После вызова функции фронтенд делает только `supabase.auth.setSession({ access_token, refresh_token })` — дополнительный `signInWithPassword` не требуется.

## Роли и способы регистрации
| Роль | Способ регистрации | Что делает Edge Function |
|------|-------------------|---------------------------|
| Администратор | Нет регистрации, вход по статическому токену | — |
| Организация / Частная сиделка | Фронтенд вызывает `supabase.auth.signUp` по email+пароль | Edge Function не нужен; после регистрации фронтенд вызывает REST/RPC для заполнения `organizations` и `user_profiles` |
| Сотрудник организации | Фронтенд отправляет телефон+пароль + токен в `accept-invite` | Edge Function создаёт пользователя, проставляет `phone_confirmed`, записывает `organization_employees`, обновляет `user_profiles` |
| Клиент | Фронтенд отправляет телефон+пароль + токен в `accept-invite` | Edge Function создаёт пользователя, проставляет `phone_confirmed`, создаёт запись в `clients`, обновляет `user_profiles`, привязывает карточку/дневник |

## Подробные шаги функции `accept-invite`
1. Получить `token`, `phone`, `password`, дополнительные поля (имя, фамилия).
2. Найти токен в таблице приглашений (`organization_invite_tokens` или `caregiver/organization_client_invite_tokens`).
3. Проверить срок действия и статус (`used_at` = NULL).
4. Создать пользователя:
   ```ts
   const { data: user } = await supabaseAdmin.auth.admin.createUser({
     phone,
     password,
     phone_confirm: true,
     email_confirm: true
   });
   ```
5. Вставить запись в `user_profiles` (role `org_employee` или `client`, `phone_e164`, ссылки на `organization_id`/`client_id`).
6. Добавить запись в профильную таблицу:
   - сотрудник: `organization_employees` с ролью, ФИО, phone.
   - клиент: `clients` + связи `invited_by_*`, привязка к `patient_card_id` / `diary_id` (если есть).
7. Пометить токен `used_at`, `used_by`.
8. Вернуть JWT (через `supabaseAdmin.auth.getSession`) или просто `user.id`, чтобы фронтенд выполнил login через `supabase.auth.signInWithPassword({ phone, password })`.

## Отсутствие SMS-кода
- Используем сервисную функцию `createUser` и сразу ставим `phone_confirmed = true`.
- Фронтенд после успешного ответа вызывает `signInWithPassword` (телефон+пароль). Поскольку `phone_confirmed = true`, Supabase не требует OTP.
- SMS-рассылки не нужны, телефон просто сохраняем и считаем подтверждённым.

## Автоматическое заполнение профиля
- Для организаций/сиделок: после регистрации по email фронтенд отправляет RPC (или REST) `upsert_profile`, который заполняет `user_profiles` и `organizations` (город, адрес, телефон). Это отдельный шаг в `ProfileSetupPage`.
- Для сотрудников и клиентов: Edge Function сразу заполняет профили и создаёт записи в соответствующих таблицах.
- Для клиентов функция также привязывает дневник: если токен содержит `diary_id`, обновляем `diaries.owner_client_id`, `diaries.organization_id`, `diary_client_links`.

## Пример сценария (для проверки)
1. **Организация** регистрируется по email → получает запись в `auth.users`. После заполнения профиля создаёт токен для сотрудника (`organization_invite_tokens`).
2. **Сотрудник** вводит телефон+пароль+токен → `accept-invite` создаёт пользователя, подтверждает телефон, добавляет его в `organization_employees` и `user_profiles`.
3. Организация создаёт карточку и дневник, затем токен для клиента (`organization_client_invite_tokens`).
4. **Клиент** вводит телефон+пароль+токен → `accept-invite` создаёт пользователя, запись в `clients`, привязывает дневник.
5. Клиент входит по телефону+паролю (без SMS), видит дневник и управляет доступами.

## Как прогонять тест вручную
1. **Подготовка**: в Supabase Studio создайте пустые строки в таблицах `organization_invite_tokens` / `organization_client_invite_tokens` с корректными полями (organization_id, patient_card_id и т.д.).
2. **Вызов Edge Function**: через curl или Thunder Client отправьте POST на `/functions/v1/accept-invite` с телом:
   ```json
   {
     "token": "org_invite_token",
     "phone": "+79990000001",
     "password": "P@ssw0rd",
     "role": "employee",
     "firstName": "Сергей",
     "lastName": "Иванов"
   }
   ```
3. **Проверка Supabase**: убедитесь, что появились записи в `auth.users`, `user_profiles`, `organization_employees` (или `clients`).
4. **Вход на фронте**: выполните `supabase.auth.signInWithPassword({ phone, password })` и убедитесь, что сессия создаётся без SMS. Повторите для клиента.
5. **Очистка**: пометьте токены использованными (или удалите), при необходимости удалите тестовых пользователей через Supabase Studio.

### Пример POST-запроса
```http
POST https://<PROJECT>.supabase.co/functions/v1/accept-invite
Content-Type: application/json
Authorization: Bearer <SUPABASE_ANON_KEY>

{
  "token": "abcdef123",
  "phone": "+79990000001",
  "password": "P@ssw0rd1",
  "firstName": "Сергей",
  "lastName": "Иванов"
}
```
Ответ:
```json
{
  "success": true,
  "data": {
    "userId": "93f1c7b7-...",
    "role": "org_employee",
    "organizationId": "...",
    "session": {
      "access_token": "...",
      "refresh_token": "...",
      "expires_in": 3600,
      "token_type": "bearer"
    }
  }
}
```
Теперь фронтенд сохраняет токены:
```ts
await supabase.auth.setSession({
  access_token: data.session.access_token,
  refresh_token: data.session.refresh_token,
});
```

## RPC для управления приглашениями
- `select * from generate_invite_link('organization_employee', jsonb_build_object('employee_role','caregiver'))` — создаёт токен, доступно организациям и менеджерам.
- `select * from revoke_invite_link('<invite_uuid>')` — помечает приглашение отозванным.

Параметры `payload` (jsonb):
| invite_type | Обязательные поля payload |
|-------------|---------------------------|
| `organization_employee` | `employee_role`, опционально `phone`, `email`, `name`, `expires_in_hours` |
| `organization_client` | `patient_card_id`, опционально `diary_id`, `phone`, `name`, `expires_in_hours` |
| `caregiver_client` | `phone`, `name`, `expires_in_hours` |

Все функции вызываются от имени текущей организации (по `auth.uid()`), проверяют права и возвращают строку из `invite_tokens` (с токеном и датами).
