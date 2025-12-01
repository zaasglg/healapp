import { useNavigate } from 'react-router-dom'
import { Button, Card } from '@/components/ui'

export const LandingPage = () => {
  const navigate = useNavigate()

  const handleWhatsAppClick = () => {
    const phoneNumber = '79145391376'
    const message = encodeURIComponent('Здравствуйте! Хочу записаться на закрытое тестирование Дневника подопечного.')
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`
    window.open(whatsappUrl, '_blank')
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#7DD3DC] via-[#5CBCC7] to-[#55ACBF] text-white">
        <div className="container mx-auto px-4 py-16 md:py-24 lg:py-32">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold font-manrope mb-6 leading-tight">
              Дневник здоровья
            </h1>
            <p className="text-xl md:text-2xl font-sans mb-8 text-white/90 leading-relaxed">
              Отслеживай динамику здоровья и улучшай состояние родственника
            </p>
            <p className="text-lg md:text-xl font-sans mb-10 text-white/80 max-w-2xl mx-auto leading-relaxed">
              Цифровой дневник для записи показателей здоровья. Все данные в одном месте — 
              видишь динамику, замечаешь изменения, принимаешь решения вовремя.
            </p>
            <div className="flex flex-col gap-4 justify-center items-center max-w-sm mx-auto">
              <Button
                size="lg"
                variant="secondary"
                onClick={handleWhatsAppClick}
                className="bg-white text-[#55ACBF] hover:bg-gray-50 w-full"
                fullWidth
              >
                Тестировать
              </Button>
              <div className="flex flex-col items-center w-full">
                <Button
                  size="lg"
                  onClick={() => navigate('/login')}
                  className="bg-transparent border-2 border-white text-white hover:bg-white/10 w-full"
                  fullWidth
                >
                  Войти
                </Button>
                <p className="text-white/80 text-xs mt-2 text-center max-w-xs">
                  Доступно тем, кто зарегистрировался на закрытое тестирование
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Декоративные элементы */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-20 right-10 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-white/5 rounded-full blur-3xl"></div>
        </div>
      </section>

      {/* Простое описание продукта */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold font-manrope text-gray-dark mb-8 text-center">
              Как это работает?
            </h2>
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-[#F5F9FA] to-white p-6 rounded-2xl border border-[#E5F0F2]">
                <h3 className="text-xl font-bold font-manrope text-gray-dark mb-3 flex items-center gap-3">
                  <span className="w-8 h-8 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center text-white font-bold">
                    1
                  </span>
                  Создаёшь карточку подопечного
                </h3>
                <p className="text-lg text-gray-700 font-sans leading-relaxed ml-11">
                  Заполняешь основные данные: имя, возраст, диагнозы. Это как медицинская карта, только проще.
                </p>
              </div>

              <div className="bg-gradient-to-r from-[#F5F9FA] to-white p-6 rounded-2xl border border-[#E5F0F2]">
                <h3 className="text-xl font-bold font-manrope text-gray-dark mb-3 flex items-center gap-3">
                  <span className="w-8 h-8 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center text-white font-bold">
                    2
                  </span>
                  Записываешь показатели каждый день
                </h3>
                <p className="text-lg text-gray-700 font-sans leading-relaxed ml-11">
                  Температура, давление, пульс, сахар — всё в несколько нажатий. Можно добавить фото или голосовую заметку.
                </p>
              </div>

              <div className="bg-gradient-to-r from-[#F5F9FA] to-white p-6 rounded-2xl border border-[#E5F0F2]">
                <h3 className="text-xl font-bold font-manrope text-gray-dark mb-3 flex items-center gap-3">
                  <span className="w-8 h-8 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center text-white font-bold">
                    3
                  </span>
                  Все видят актуальную информацию
                </h3>
                <p className="text-lg text-gray-700 font-sans leading-relaxed ml-11">
                  Сиделка записала давление утром — ты видишь это сразу. Врач может посмотреть графики за месяц. 
                  Всё синхронизируется автоматически.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Для кого это */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-white to-[#F5F9FA]">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold font-manrope text-gray-dark mb-4 text-center">
            Для кого это?
          </h2>
          <p className="text-lg text-gray-700 font-sans text-center mb-12 max-w-2xl mx-auto">
            Дневник здоровья подходит разным людям, которые заботятся о здоровье близких
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {/* Для клиентов */}
            <Card className="p-6 md:p-8 hover:shadow-lg transition-shadow">
              <div className="w-16 h-16 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold font-manrope text-gray-dark mb-4 text-center">
                Для родственников
              </h3>
              <p className="text-gray-700 font-sans leading-relaxed text-center">
                Хочешь завести дневник для своего родственника? Теперь вся информация о его здоровье 
                будет в одном месте. Ты всегда будешь знать, что происходит, даже если не можешь быть рядом каждый день.
              </p>
            </Card>

            {/* Для частных сиделок */}
            <Card className="p-6 md:p-8 hover:shadow-lg transition-shadow">
              <div className="w-16 h-16 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold font-manrope text-gray-dark mb-4 text-center">
                Для частных сиделок
              </h3>
              <p className="text-gray-700 font-sans leading-relaxed text-center">
                Хочешь повысить качество своих услуг и показать свою дисциплинированность? 
                Веди дневник для каждого подопечного — клиенты увидят твою ответственность и профессионализм. 
                Это выделит тебя среди других сиделок.
              </p>
            </Card>

            {/* Для агентств и пансионатов */}
            <Card className="p-6 md:p-8 hover:shadow-lg transition-shadow">
              <div className="w-16 h-16 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="text-xl font-bold font-manrope text-gray-dark mb-4 text-center">
                Для агентств и пансионатов
              </h3>
              <p className="text-gray-700 font-sans leading-relaxed text-center">
                Нужен удобный инструмент для автоматизации процесса? Дневник здоровья позволит 
                твоим клиентам не волноваться за своих родных — они всегда будут видеть актуальную информацию. 
                Это повысит доверие и снизит количество звонков с вопросами.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Ценности и преимущества */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold font-manrope text-gray-dark mb-12 text-center">
            Почему это важно?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            <Card className="text-center p-6">
              <div className="w-16 h-16 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold font-manrope text-gray-dark mb-3">
                Полная картина
              </h3>
              <p className="text-gray-700 font-sans">
                Все данные в одном месте: показатели здоровья, медикаменты, 
                процедуры и заметки от всех участников ухода
              </p>
            </Card>

            <Card className="text-center p-6">
              <div className="w-16 h-16 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold font-manrope text-gray-dark mb-3">
                В режиме реального времени
              </h3>
              <p className="text-gray-700 font-sans">
                Мгновенная синхронизация данных между всеми участниками. 
                Вы всегда в курсе текущего состояния подопечного
              </p>
            </Card>

            <Card className="text-center p-6">
              <div className="w-16 h-16 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold font-manrope text-gray-dark mb-3">
                Аналитика и отчёты
              </h3>
              <p className="text-gray-700 font-sans">
                Графики динамики показателей, экспорт данных в PDF и CSV. 
                Вся информация структурирована и доступна для анализа
              </p>
            </Card>

            <Card className="text-center p-6">
              <div className="w-16 h-16 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold font-manrope text-gray-dark mb-3">
                Безопасность данных
              </h3>
              <p className="text-gray-700 font-sans">
                Гибкая система доступа: вы контролируете, кто может просматривать 
                и редактировать данные о подопечном
              </p>
            </Card>

            <Card className="text-center p-6">
              <div className="w-16 h-16 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold font-manrope text-gray-dark mb-3">
                Мультимедиа
              </h3>
              <p className="text-gray-700 font-sans">
                Фото, видео и голосовые заметки — фиксируйте важные моменты 
                и изменения состояния визуально
              </p>
            </Card>

            <Card className="text-center p-6">
              <div className="w-16 h-16 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold font-manrope text-gray-dark mb-3">
                Командная работа
              </h3>
              <p className="text-gray-700 font-sans">
                Объединяет родственников, сиделок, медсестёр и врачей. 
                Каждый вносит свой вклад в общую картину
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Основные функции */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-white to-[#F5F9FA]">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold font-manrope text-gray-dark mb-12 text-center">
              Основные возможности
            </h2>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center mt-1">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold font-manrope text-gray-dark mb-2">
                    Структурированные показатели здоровья
                  </h3>
                  <p className="text-gray-700 font-sans">
                    Температура, давление, пульс, сахар, вес и другие важные метрики. 
                    Настраиваемые наборы показателей для каждого подопечного
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center mt-1">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold font-manrope text-gray-dark mb-2">
                    Карточка подопечного
                  </h3>
                  <p className="text-gray-700 font-sans">
                    Личные данные, диагнозы, мобильность и другая важная информация 
                    в структурированном виде
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center mt-1">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold font-manrope text-gray-dark mb-2">
                    Графики и аналитика
                  </h3>
                  <p className="text-gray-700 font-sans">
                    Визуализация динамики показателей во времени. 
                    Отслеживание трендов и выявление закономерностей
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center mt-1">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold font-manrope text-gray-dark mb-2">
                    Экспорт данных
                  </h3>
                  <p className="text-gray-700 font-sans">
                    Генерация отчётов в PDF и CSV форматах для передачи врачам 
                    или ведения документации
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-[#7DD3DC] to-[#5CBCC7] rounded-full flex items-center justify-center mt-1">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold font-manrope text-gray-dark mb-2">
                    Гибкая система доступа
                  </h3>
                  <p className="text-gray-700 font-sans">
                    Пригласительные ссылки для организаций, сиделок и клиентов. 
                    Вы контролируете, кто имеет доступ к данным
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Запись на закрытое тестирование через WhatsApp */}
      <section className="py-16 md:py-24 bg-gradient-to-br from-[#F5F9FA] to-white">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <Card className="p-8 md:p-12 text-center">
              <div className="mb-8">
                <div className="w-20 h-20 bg-gradient-to-br from-[#25D366] to-[#128C7E] rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold font-manrope text-gray-dark mb-4">
                  Записаться на закрытое тестирование
                </h2>
                <p className="text-lg text-gray-700 font-sans mb-8 leading-relaxed">
                  Мы запускаем закрытое тестирование системы. 
                  Напишите нам, и мы отправим вам пригласительную ссылку для доступа к платформе.
                </p>
              </div>

              <Button
                size="lg"
                fullWidth
                onClick={handleWhatsAppClick}
                className="bg-gradient-to-r from-[#25D366] to-[#128C7E] hover:from-[#20BA5A] hover:to-[#0F7A6D] text-white border-0 shadow-lg hover:shadow-xl"
              >
                <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                Связаться в WhatsApp
              </Button>

              <a
                href="https://t.me/povelmar"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Связаться в Telegram"
                title="Связаться в Telegram"
                className="mt-4 w-full inline-flex items-center justify-center gap-3 text-white rounded-2xl px-4 py-1 text-sm font-semibold border-0 shadow-lg hover:shadow-xl bg-gradient-to-r from-[#00aaff] to-[#0077cc] hover:from-[#2faaff] hover:to-[#006fa0]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="size-12 mr-2 flex-shrink-0" viewBox="0 0 32 32" fill="none" aria-hidden>
                  <path d="M22.9866 10.2088C23.1112 9.40332 22.3454 8.76755 21.6292 9.082L7.36482 15.3448C6.85123 15.5703 6.8888 16.3483 7.42147 16.5179L10.3631 17.4547C10.9246 17.6335 11.5325 17.541 12.0228 17.2023L18.655 12.6203C18.855 12.4821 19.073 12.7665 18.9021 12.9426L14.1281 17.8646C13.665 18.3421 13.7569 19.1512 14.314 19.5005L19.659 22.8523C20.2585 23.2282 21.0297 22.8506 21.1418 22.1261L22.9866 10.2088Z" fill="currentColor" />
                </svg>
                <span>Связаться в Telegram</span>
              </a>

              <p className="mt-6 text-sm text-gray-600 font-sans">
                Нажав на кнопку, вы перейдёте в WhatsApp или Telegram для связи с нами
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-dark text-white py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h3 className="text-2xl font-bold font-manrope mb-4">
              Дневник здоровья
            </h3>
            <p className="text-gray-300 font-sans mb-6">
              Простой способ следить за здоровьем близкого человека
            </p>
            <div className="mt-8 pt-8 border-t border-gray-600">
              <p className="text-sm text-gray-400 font-sans">
                © {new Date().getFullYear()} Дневник здоровья. Все права защищены.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
