# Экспорт и очистка локальных данных

Для перехода на Supabase все временные данные, которые раньше сохранялись во фронтенде, нужно зафиксировать (при необходимости) и удалить. Ниже — пошаговая инструкция для разработчиков/QA.

## 1. Экспорт в JSON (опционально)
Если требуется сохранить текущее состояние для архива или сравнения:

1. Откройте приложение в браузере (Chrome). Перейдите на любую страницу, где доступен `localStorage`.
2. Откройте DevTools → вкладка `Console`.
3. Вставьте и выполните скрипт:
   ```javascript
   (function exportLocalStorage() {
     const data = {};
     for (let i = 0; i < localStorage.length; i += 1) {
       const key = localStorage.key(i);
       data[key] = JSON.parse(localStorage.getItem(key));
     }
     const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
     const link = document.createElement('a');
     link.href = URL.createObjectURL(blob);
     link.download = `localStorage-export-${new Date().toISOString()}.json`;
     link.click();
   })();
   ```
4. В загрузках появится файл `localStorage-export-YYYY-MM-DDTHH-MM-SSZ.json`. Сохраните его при необходимости (только для анализа, импорт в Supabase **не выполняем**).

## 2. Очистка localStorage
Сразу после экспорта (или если архив не нужен):

```javascript
localStorage.clear();
```

После выполнения перезагрузите страницу, чтобы убедиться, что приложение больше не использует старые ключи.

## 3. Контрольные проверки
- После очистки дополнительно проверить, что в DevTools → `Application` → `Local Storage` → ваш домен пустой.
- Если в коде остались обращения к старым ключам, при запуске будет логироваться `null`. Перед интеграцией с Supabase необходимо удалить все вызовы `localStorage` из кода (это входит в этап 16.6).

## 4. Запуск нового тестового сценария
Дальше все данные создаются исключительно через Supabase:
- регистрация по приглашению (Edge Function),
- создание карточек/дневников через API,
- заполнение метрик с записью в базу.

Никаких локальных копий данных больше не храним.
