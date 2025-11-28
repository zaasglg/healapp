# ✅ Исправлена ошибка импорта supabaseConfig

## Проблема

Ошибка: `Failed to resolve import "../../utils/supabaseConfig" from "src/pages/ClientInviteRegisterPage.tsx"`

## Причина

Использовался динамический импорт `await import('../../utils/supabaseConfig')`, который не работал корректно в Vite.

## Решение

Заменены все динамические импорты на статические импорты в начале файлов:

1. ✅ `src/pages/ClientInviteRegisterPage.tsx`
2. ✅ `src/pages/RegisterPage.tsx`
3. ✅ `src/pages/admin/AdminInvitesPage.tsx`
4. ✅ `src/pages/admin/AdminUsersPage.tsx`
5. ✅ `src/pages/admin/AdminSupportPage.tsx`
6. ✅ `src/pages/admin/AdminMonitoringPage.tsx`

## Настройка окружения

Создайте файл `.env.local` в корне проекта:

```env
# Supabase Configuration для российского сервера
VITE_SUPABASE_URL=http://176.124.217.224
VITE_SUPABASE_ANON_KEY=kSW54FYXXViT8ifRUef7DqfNXYp687ecDjdp8HSggodn1To2638caajJMoA48qze
```

## Следующие шаги

1. Создайте файл `.env.local` с настройками выше
2. Перезапустите dev сервер: `npm run dev`
3. Проверьте, что приложение работает

