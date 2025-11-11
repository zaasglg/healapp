// Функция для перевода ошибок Supabase на русский язык

export const translateError = (error: any): string => {
  if (!error) {
    return 'Произошла неизвестная ошибка'
  }

  const errorMessage = error.message || error.toString()

  // Ошибки сети
  if (errorMessage.includes('Failed to fetch') || errorMessage.includes('fetch')) {
    return 'Ошибка подключения к серверу. Проверьте интернет-соединение и попробуйте ещё раз.'
  }

  // Ошибки авторизации
  if (errorMessage.includes('Invalid login credentials')) {
    return 'Неверный email/телефон или пароль'
  }

  if (errorMessage.includes('Email not confirmed')) {
    return 'Email не подтвержден. Проверьте почту и подтвердите регистрацию.'
  }

  if (errorMessage.includes('Phone signups are disabled')) {
    return 'Регистрация по телефону отключена в настройках Supabase. Включите "Phone Auth" в Authentication → Settings.'
  }

  if (errorMessage.includes('User already registered')) {
    return 'Пользователь с таким email уже зарегистрирован'
  }

  if (errorMessage.includes('Password should be at least')) {
    return 'Пароль должен содержать минимум 6 символов'
  }

  if (errorMessage.includes('Invalid email')) {
    return 'Некорректный email адрес'
  }

  // Ошибки Supabase
  if (errorMessage.includes('JWT')) {
    return 'Ошибка авторизации. Попробуйте войти заново.'
  }

  if (errorMessage.includes('Network')) {
    return 'Ошибка сети. Проверьте подключение к интернету.'
  }

  // Ошибки конфигурации
  if (errorMessage.includes('Missing Supabase')) {
    return 'Ошибка конфигурации. Обратитесь к администратору.'
  }

  // Если не нашли конкретный перевод, возвращаем общее сообщение
  return 'Произошла ошибка. Попробуйте ещё раз или обратитесь в поддержку.'
}

