import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

export const LandingPage = () => {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<"relative" | "caregiver" | null>(null);
  const nextSectionRef = useRef<HTMLElement>(null);

  // Блокировка скролла пока роль не выбрана + автоскролл наверх
  useEffect(() => {
    if (!selectedRole) {
      document.body.style.overflow = "hidden";

      // Скроллим наверх если роль не выбрана
      window.scrollTo({ top: 0, behavior: "smooth" });

      // Добавляем обработчик для предотвращения скролла
      const preventScroll = (e: Event) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      };

      window.addEventListener("scroll", preventScroll, { passive: false });
      window.addEventListener("wheel", preventScroll, { passive: false });
      window.addEventListener("touchmove", preventScroll, { passive: false });

      return () => {
        window.removeEventListener("scroll", preventScroll);
        window.removeEventListener("wheel", preventScroll);
        window.removeEventListener("touchmove", preventScroll);
      };
    } else {
      document.body.style.overflow = "auto";
    }

    // Очистка при размонтировании компонента
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [selectedRole]);

  const handleRoleSelect = (role: "relative" | "caregiver") => {
    setSelectedRole(role);
    // Плавный скролл к следующей секции
    setTimeout(() => {
      nextSectionRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleWhatsAppClick = () => {
    const phoneNumber = "79145391376";
    const message = encodeURIComponent(
      "Здравствуйте! Хочу записаться на закрытое тестирование Дневника подопечного.",
    );
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    window.open(whatsappUrl, "_blank");
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section - 16:9 */}
      <section className="relative w-full h-screen bg-[#35B9C5] text-white flex flex-col">
        {/* Header с логотипом - абсолютное позиционирование слева сверху */}
        <header className="absolute top-0 left-0 px-8 md:px-16 py-6 md:py-8 z-10">
          <div className="flex items-center gap-4">
            <img
              src="/icons/logo.png"
              alt="Здраво"
              className="w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 object-contain"
            />
            <span className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-[#4A4A4A]">
              Здраво
            </span>
          </div>
        </header>

        {/* Основной контент - по центру */}
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="max-w-5xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 leading-tight">
              Кому вы хотите помочь?
            </h1>
            <p className="text-xl md:text-2xl font-sans mb-12 md:mb-16 text-white">
              Выберите свой вариант ниже
            </p>

            {/* Кнопки выбора роли */}
            <div className="flex flex-row gap-3 md:gap-16 justify-center items-start">
              {/* Вариант "Я родственник" */}
              <div className="flex flex-col items-center w-[160px] sm:w-[160px] md:w-[280px]">
                <button
                  onClick={() => handleRoleSelect("relative")}
                  className={`w-full h-[55px] md:h-[75px] px-2 md:px-8 rounded-full text-white font-semibold text-xs sm:text-sm md:text-lg transition-all duration-300 hover:opacity-90 hover:scale-105 ${selectedRole === "relative" ? "ring-2 md:ring-4 ring-white ring-offset-1 md:ring-offset-2 ring-offset-[#35B9C5]" : ""}`}
                  style={{
                    background:
                      "linear-gradient(to bottom, #5FBDD6 0%, #3A9BBF 100%)",
                  }}
                >
                  Я родственник
                </button>
                <p className="mt-2 md:mt-4 text-[10px] md:text-sm text-white/80 text-center leading-tight md:leading-relaxed">
                  *У меня пожилой родитель
                  <br />
                  или близкий
                </p>
              </div>

              {/* Вариант "Я сиделка/агентство/пансионат" */}
              <div className="flex flex-col items-center w-[160px] sm:w-[160px] md:w-[280px]">
                <button
                  onClick={() => handleRoleSelect("caregiver")}
                  className={`w-full h-[55px] md:h-[75px] px-2 md:px-8 leading-tight md:leading-5 rounded-full text-white font-semibold text-xs sm:text-sm md:text-lg transition-all duration-300 hover:opacity-90 hover:scale-105 shadow-lg bg-[#1E3A4C] ${selectedRole === "caregiver" ? "ring-2 md:ring-4 ring-white ring-offset-1 md:ring-offset-2 ring-offset-[#35B9C5]" : ""}`}
                >
                  Я сиделка/
                  <br />
                  организация
                </button>
                <p className="mt-2 md:mt-4 text-[10px] md:text-sm text-white/80 text-center leading-tight md:leading-relaxed">
                  *Я помогаю пожилым
                  <br />
                  людям
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Спокойствие за близкого */}
      <section ref={nextSectionRef} className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            {selectedRole === "caregiver" ? (
              <>
                <h2 className="text-4xl md:text-5xl font-bold text-[#4A4A4A] mb-6 text-left lg:text-center">
                  Порядок в работе и доверие со стороны семьи
                </h2>
                <p className="text-xl text-gray-700 font-sans leading-relaxed text-left lg:text-center">
                  Сервис <span className="font-bold text-gray-dark">Здраво</span> — простой и понятный инструмент для сиделок и организаций по уходу.
                  <br />
                  Он помогает работать спокойно и быть уверенным в каждом дне.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-4xl md:text-5xl font-bold text-[#4A4A4A] mb-6 text-left lg:text-center">
                  Спокойствие за близкого — каждый день
                </h2>
                <p className="text-xl text-gray-700 font-sans leading-relaxed text-left lg:text-center">
                  Сервис <span className="font-bold text-gray-dark">Здраво</span>,
                  помогает быть уверенным, что с пожилым родителем или близким всё в
                  порядке. Вы видите состояние, динамику и работу сиделки в одном
                  приложении.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Что такое дневник здоровья */}
      <section className="bg-center bg-cover bg-no-repeat bg-[url('/icons/f_m.png')] lg:bg-none lg:bg-[#35B9C5]">
        <div className="container mx-auto px-4 relative">
          {/* Декоративные книги */}
          <img
            src="/icons/book.png"
            alt=""
            className="absolute -top-12 left-[5%] w-16 h-16 md:w-24 md:h-24 object-contain opacity-90 -rotate-12 animate-float-slow z-0"
          />
          <img
            src="/icons/book.png"
            alt=""
            className="absolute -bottom-[5%] -left-4 md:left-[2%] size-12 md:size-28 object-contain -rotate-45 animate-float-medium z-0"
          />
          <img
            src="/icons/book.png"
            alt=""
            className="absolute top-[-65%] lg:top-auto lg:bottom-[30%] right-[4%] lg:right-auto lg:left-[35%] w-20 h-20 md:w-24 md:h-24 object-contain -rotate-6 animate-float-fast z-0"
          />
          <img
            src="/icons/book.png"
            alt=""
            className="absolute -top-8 right-[5%] w-10 h-10 md:w-24 md:h-24 object-contain rotate-12 animate-float-medium hidden md:block z-0"
          />
          <img
            src="/icons/book.png"
            alt=""
            className="absolute bottom-[15%] right-[2%] w-8 h-8 md:w-24 md:h-24 object-contain -rotate-3 animate-float-slow hidden md:block z-0"
          />

          <div className="grid grid-cols-4 lg:grid-cols-2 gap-8 items-center max-w-6xl mx-auto py-8 md:py-12">
            {/* Левая часть с текстом */}
            <div className="col-span-3 lg:col-span-1 z-10 relative py-4">
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#4A4A4A] mb-4 md:mb-6">
                Что такое дневник здоровья
              </h2>

              {selectedRole === "caregiver" ? (
                <>
                  <p className="text-base md:text-lg text-[#4A4A4A] leading-relaxed mb-6 md:mb-8">
                    Дневник здоровья — это удобный журнал в приложении.
                    <br />
                    В нём можно фиксировать показатели подопечных.
                  </p>

                  <p className="text-base md:text-lg font-semibold text-[#4A4A4A] mb-4">
                    Вы можете:
                  </p>

                  {/* Список преимуществ для сиделки */}
                  <div className="space-y-1 md:space-y-1 mb-6 md:mb-8">
                    {["Делать короткие записи", "Добавлять комментарии по состоянию", "Объяснять изменения простыми словами"].map((item, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-white/30 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-4 h-4 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                        <span className="text-base md:text-lg text-[#4A4A4A]">
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="text-base md:text-lg font-semibold text-[#4A4A4A]">
                    Без сложных форм и лишней писанины.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base md:text-lg text-[#4A4A4A] leading-relaxed mb-6 md:mb-8">
                    Дневник здоровья — это удобный журнал в приложении. В нём
                    собирается вся информация о состоянии близкого.
                  </p>

                  {/* Список преимуществ для родственника */}
                  <div className="space-y-3 md:space-y-4 mb-6 md:mb-8">
                    {["Основные показатели", "Ежедневные наблюдения", "Комментарии по состоянию", "Историю записей по дням"].map((item, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-white/30 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-4 h-4 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                        <span className="text-base md:text-lg text-[#4A4A4A]">
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="text-base md:text-lg font-semibold text-[#4A4A4A]">
                    Всё собрано в одном месте, без тетрадей и звонков.
                  </p>
                </>
              )}
            </div>

            {/* Правая часть с телефоном - выходит за пределы фона */}
            <div className="hidden lg:flex justify-center lg:justify-end relative z-10">
              <div className="relative">
                <img
                  src="/icons/phone.png"
                  alt="Приложение дневник здоровья"
                  className="w-56 md:w-72 lg:w-96 h-auto object-contain drop-shadow-2xl -mt-24 md:-mt-32 lg:-mt-48 -mb-24 md:-mb-32 lg:-mb-48"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Динамика состояния */}
      <section className="py-8 md:py-24 bg-white relative overflow-hidden">
        <div className="container mx-auto px-4 relative">
          {/* Декоративные сердца */}
          {/* Heart 1: Слева посередине, большое размытое */}
          <img
            src="/icons/heart.png"
            alt=""
            className="absolute top-1/4 -left-12 md:-left-24 w-32 h-32 md:w-52 md:h-52 object-contain opacity-80 rotate-[-15deg] blur-sm animate-float-slow z-0"
          />
          {/* Heart 2: Сверху по центру */}
          <img
            src="/icons/heart.png"
            alt=""
            className="absolute -top-12 left-1/2 -translate-x-1/2 w-20 h-20 md:w-32 md:h-32 object-contain opacity-90 rotate-12 animate-float-medium z-0"
          />
          {/* Heart 3: Справа сверху */}
          <img
            src="/icons/heart.png"
            alt=""
            className="absolute -top-16 right-0 md:-right-12 w-24 h-24 md:w-40 md:h-40 object-contain opacity-80 rotate-[30deg] animate-float-fast z-0"
          />
          {/* Heart 4: Снизу слева от текста */}
          <img
            src="/icons/heart.png"
            alt=""
            className="absolute bottom-0 left-1/3 w-16 h-16 md:w-24 md:h-24 object-contain opacity-70 rotate-[-10deg] animate-float-slow z-0"
          />
          {/* Heart 5: Справа снизу */}
          <img
            src="/icons/heart.png"
            alt=""
            className="absolute -bottom-12 right-4 md:right-16 w-24 h-24 md:w-36 md:h-36 object-contain opacity-80 rotate-[15deg] blur-[2px] animate-float-medium z-0"
          />

          <div className="flex flex-col lg:flex-row items-center justify-center gap-8 md:gap-16 max-w-6xl mx-auto py-8 md:py-12">
            {/* Левая часть с телефоном */}
            <div className="flex justify-center relative z-10 order-2 lg:order-1 flex-1 lg:flex-none">
              <div className="relative">
                <img
                  src="/icons/phone-2.png"
                  alt="Динамика состояния в приложении"
                  className="w-56 md:w-72 lg:w-80 h-auto object-contain drop-shadow-2xl md:-my-12 lg:-my-16"
                />
              </div>
            </div>

            {/* Правая часть с текстом */}
            <div className="z-10 relative py-4 order-1 lg:order-2 flex-1 max-w-2xl text-center lg:text-left">
              {selectedRole === "caregiver" ? (
                <>
                  <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-[#4A4A4A] mb-6 leading-tight text-left">
                    Безопасность специалиста и доверие со стороны родственников
                  </h2>
                  <p className="text-lg md:text-xl text-[#4A4A4A] leading-relaxed font-sans mb-4 text-left ">
                    Все действия и комментарии фиксируются в приложении.
                  </p>

                  {/* Список преимуществ */}
                  <div className="space-y-1 md:space-y-2 mb-6">
                    {["Видно, что, когда и как было сделано", "Есть объяснения к выполненным действиям", "Меньше недоразумений с родственниками"].map((item, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-[#35B9C5]/30 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-4 h-4 text-[#35B9C5]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                        <span className="text-base md:text-lg text-[#4A4A4A]">
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="text-lg md:text-xl font-semibold text-[#4A4A4A]">
                    Ваша работа прозрачна и защищена.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-[#4A4A4A] mb-6 leading-tight text-left">
                    Динамика состояния — с понятными комментариями
                  </h2>
                  <p className="text-lg md:text-xl text-[#4A4A4A] leading-relaxed font-sans text-left">
                    Приложение показывает не просто цифры, а как{" "}
                    <br className="hidden md:block" />
                    состояние меняется со временем.{" "}
                    <br className="hidden md:block" />
                    Вы понимаете, что происходит и почему.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Маршрутный лист ухода */}
      <section className="relative overflow-visible z-30">

        <div className="container mx-auto px-4 pt-12 pb-12">
          <h2 className="block lg:hidden text-3xl md:text-4xl lg:text-5xl font-black text-[#4A4A4A] mb-6 leading-tight text-left">
            Маршрутный лист ухода
          </h2>
          <p className="block lg:hidden text-lg md:text-xl text-[#4A4A4A] leading-relaxed font-sans mb-6 text-left">
            В приложении вы видите конкретный список задач по уходу и отмечаете выполнение по ходу работы.
          </p>
        </div>
        <div className="bg-top bg-cover bg-no-repeat bg-[url('/icons/s_2.png')] lg:bg-none lg:bg-[#35B9C5]">
          <div className="container mx-auto px-4 relative">
            {/* Декоративные календари */}
            <img
              src="/icons/calendar.png"
              alt=""
              className="absolute -top-16 left-0 w-24 h-24 md:w-40 md:h-40 object-contain rotate-12 animate-float-slow z-20 blur-[2px]"
            />
            <img
              src="/icons/calendar.png"
              alt=""
              className="absolute bottom-0 -left-8 md:left-[2%] w-16 h-16 md:w-32 md:h-32 object-contain rotate-6 animate-float-medium z-20"
            />
            <img
              src="/icons/calendar.png"
              alt=""
              className="absolute bottom-[100%] lg:bottom-[30%] left-[70%] lg:left-[30%] w-20 h-20 md:w-36 md:h-36 object-contain -rotate-6 animate-float-fast z-20"
            />
            <img
              src="/icons/calendar.png"
              alt=""
              className="absolute -top-12 right-[2%] w-16 h-16 md:w-36 md:h-36 object-contain  rotate-12 animate-float-medium hidden md:block z-20"
            />
            <img
              src="/icons/calendar.png"
              alt=""
              className="absolute bottom-[20%] right-[2%] w-14 h-14 md:w-36 md:h-36 object-contain -rotate-3 animate-float-slow hidden md:block z-20"
            />

            <div className="flex flex-col lg:flex-row items-center justify-center gap-8 md:gap-16 w-8/12 lg:max-w-6xl lg:mx-auto pt-2 md:pt-6">
              {/* Левая часть с текстом */}
              <div className="z-10 relative py-4 flex-1 order-1 lg:order-1 text-lef">
                {selectedRole === "caregiver" ? (
                  <>
                    <h2 className="hidden lg:block text-3xl md:text-4xl lg:text-5xl font-black text-[#4A4A4A] mb-6 leading-tight text-left">
                      Маршрутный лист ухода
                    </h2>
                    <p className="hidden lg:block text-lg md:text-xl text-[#4A4A4A] leading-relaxed font-sans mb-6 text-left">
                      В приложении вы видите конкретный список задач по уходу и отмечаете выполнение по ходу работы.
                    </p>

                    <div className="mb-4">
                      <h3 className="text-xl md:text-2xl font-bold text-[#4A4A4A] mb-2">
                        Плюсы:
                      </h3>
                      <ul className="space-y-1">
                        {[
                          "Понятный план на день",
                          "Ничего не забывается",
                          "Легко добавить комментарий к задаче",
                        ].map((item, index) => (
                          <li
                            key={index}
                            className="flex items-center gap-3 justify-start"
                          >
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/30 flex items-center justify-center">
                              <svg
                                className="w-4 h-4 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            </div>
                            <span className="text-lg text-[#4A4A4A] font-medium">
                              {item}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-xl md:text-2xl font-bold text-[#4A4A4A] mb-4">
                        Примеры задач:
                      </h3>
                      <div className="grid grid-cols-2 gap-4 max-w-md mx-auto lg:mx-0">
                        {[
                          "Утренняя гигиена",
                          "Завтрак",
                          "Прогулка",
                          "Игра в шахматы",
                        ].map((tag, index) => (
                          <div
                            key={index}
                            className="bg-white rounded-xl py-3 px-4 text-center shadow-sm text-[#4A4A4A] font-medium"
                          >
                            {tag}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="hidden lg:block text-3xl md:text-4xl lg:text-5xl font-black text-[#4A4A4A] mb-6 leading-tight text-left">
                      Маршрутный лист ухода
                    </h2>
                    <p className="hidden lg:block text-lg md:text-xl text-[#4A4A4A] leading-relaxed font-sans mb-8 text-left">
                      Маршрутный лист — это список конкретных задач для{" "}
                      <br className="hidden md:block" />
                      сиделки. Вы сами указываете, что нужно сделать.
                    </p>

                    <div className="mb-4">
                      <h3 className="text-xl md:text-2xl font-bold text-[#4A4A4A] mb-2">
                        В приложении видно:
                      </h3>
                      <ul className="space-y-1">
                        {[
                          "Какие задачи поставлены",
                          "Что уже выполнено",
                          "Комментарии к задачам",
                          "Когда и кем это сделано",
                        ].map((item, index) => (
                          <li
                            key={index}
                            className="flex items-center gap-3 justify-start"
                          >
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/30 flex items-center justify-center">
                              <svg
                                className="w-4 h-4 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            </div>
                            <span className="text-lg text-[#4A4A4A] font-medium">
                              {item}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-xl md:text-2xl font-bold text-[#4A4A4A] mb-4">
                        Примеры задач:
                      </h3>
                      <div className="grid grid-cols-2 gap-4 max-w-md mx-auto lg:mx-0">
                        {[
                          "Утренняя гигиена",
                          "Завтрак",
                          "Прогулка",
                          "Игра в шахматы",
                        ].map((tag, index) => (
                          <div
                            key={index}
                            className="bg-white rounded-xl py-3 px-4 text-center shadow-sm text-[#4A4A4A] font-medium"
                          >
                            {tag}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Правая часть с телефоном */}
              <div className="hidden lg:flex justify-center z-10 flex-1 order-2 lg:order-2 ">
                <div className="relative">
                  <img
                    src="/icons/phone-3.png"
                    alt="Маршрутный лист в приложении"
                    className="w-auto md:w-80 lg:w-[400px] h-auto object-contain drop-shadow-2xl -mt-32 md:-mt-32 lg:-mt-32"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Дополнительные функции для организаций - только для сиделки */}
      {selectedRole === "caregiver" && (
        <section className="py-12 md:py-20 bg-white">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-[#4A4A4A] text-center mb-10 md:mb-16">
              Дополнительные функции для организаций
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-5xl mx-auto">
              {/* Карточка Пансионат */}
              <div className="bg-[#F8F9FA] rounded-2xl p-6 md:p-8 shadow-sm">
                <h3 className="text-2xl md:text-3xl font-bold text-[#4A4A4A] mb-6 text-center">
                  Пансионат
                </h3>
                <ul className="space-y-3">
                  {[
                    "Создание расписания пансионата",
                    "Самостоятельное создание карточки подопечного и дневника",
                    "Добавление сотрудников в приложение организации",
                    "Постановка задач конкретным сотрудникам по конкретному подопечному в маршрутном листе",
                  ].map((item, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-[#35B9C5]/20 flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-[#35B9C5]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                      <span className="text-base text-[#4A4A4A] leading-relaxed">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Карточка Патронажное агентство */}
              <div className="bg-[#F8F9FA] rounded-2xl p-6 md:p-8 shadow-sm">
                <h3 className="text-2xl md:text-3xl font-bold text-[#4A4A4A] mb-6 text-center">
                  Патронажное агентство
                </h3>
                <ul className="space-y-3">
                  {[
                    "Самостоятельное создание карточки подопечного и дневника",
                    "Добавление сотрудников в приложение организации",
                    "Постановка задач конкретным сотрудникам по конкретному подопечному в маршрутном листе",
                  ].map((item, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-[#35B9C5]/20 flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-[#35B9C5]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                      <span className="text-base text-[#4A4A4A] leading-relaxed">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Как начать пользоваться */}
      <section className="hidden lg:block py-12 md:py-24 bg-white overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="relative max-w-5xl mx-auto h-auto lg:h-[600px] flex flex-col lg:block">
            {/* Заголовок по центру (Desktop) */}
            <div className="hidden lg:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-full justify-center">
              <h2 className="text-4xl md:text-5xl font-black text-[#4A4A4A] text-center">
                Как начать пользоваться
              </h2>
            </div>
            {/* Заголовок (Mobile) */}
            <h2 className="lg:hidden text-3xl font-black text-[#4A4A4A] text-center mb-12">
              Как начать пользоваться
            </h2>

            {/* 1. Скачайте приложение (Top Left) */}
            <div className="relative lg:absolute lg:top-0 lg:left-[8%] flex flex-col items-center lg:block mb-12 lg:mb-0">
              <img src="/icons/market.svg" alt="Market" className="h-[300px]" />
            </div>

            {/* ИЛИ Text */}
            <div className="hidden lg:block absolute top-28 left-[30%] text-2xl font-bold text-gray-400 -rotate-12">
              ИЛИ
            </div>

            {/* 2. Зарегистрируйтесь (Top Center) */}
            <div className="relative lg:absolute lg:top-[-7%] lg:left-[42%] flex flex-col items-center lg:block mb-12 lg:mb-0">
              <img
                src="/icons/register_by_link.svg"
                className="h-[300px]"
                alt=""
              />
            </div>

            {/* 3. Создайте карточку (Top Right) */}
            <div className="relative lg:absolute lg:top-[0%] lg:right-[-13%] flex flex-col items-center lg:block mb-12 lg:mb-0">
              <img
                src={selectedRole === "relative"
                  ? "/icons/love.svg"
                  : "/icons/lova_caregiver.svg"}
                alt="love"
                className="h-[250px]"
              />

            </div>

            {/* 4. Создайте дневник (Bottom Right) */}
            <div className="relative lg:absolute lg:bottom-[1%] lg:right-0 flex flex-col items-center lg:block mb-12 lg:mb-0">
              <img
                src={selectedRole === "relative"
                  ? "/icons/create_diary.svg"
                  : "/icons/create_diart_caregiver.svg"}
                alt="Doctor"
                className="w-full h-auto object-contain drop-shadow-md translate-y-2"
              />
            </div>

            {/* 5. Передайте доступ (Bottom Left) */}
            <div className="relative lg:absolute lg:bottom-0 lg:left-[20%] flex flex-col items-center lg:block">
              <img
                src={selectedRole === "relative"
                  ? "/icons/doctor.svg"
                  : "/icons/doctor_caregiver.svg"}
                alt="Doctor"
                className="w-full h-auto object-contain drop-shadow-md translate-y-2"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="block lg:hidden">
        <img src={selectedRole === "relative"
          ? "/icons/how_to_use.svg"
          : "/icons/how_to_use_cav.svg"} className="px-10" alt="" />
      </section>

      {/* Скачайте приложение */}
      <section className="py-12 md:py-16 bg-[#35B9C5]">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-black text-[#4A4A4A] mb-8 md:mb-12 leading-tight">
              Выберите ваш телефон, скачайте приложение по кнопке и начните
              пользоваться
            </h2>

            {/* Кнопки скачивания - Mobile */}
            <div className="flex flex-col gap-4 items-center mb-8 md:hidden">
              <a
                href="#"
                className="bg-white text-gray-800 font-medium py-3 px-8 rounded-full shadow-sm border border-gray-200 w-64 text-center"
              >
                Скачать для Андроид
              </a>
              <a
                href="#"
                className="bg-white text-gray-800 font-medium py-3 px-8 rounded-full shadow-sm border border-gray-200 w-64 text-center"
              >
                Скачать для Айфон
              </a>
            </div>

            {/* Кнопки скачивания - Desktop */}
            <div className="hidden md:flex flex-row gap-12 justify-center items-center mb-12">
              {/* Скачать для Андроид */}
              <div className="relative flex flex-col items-center">
                <img src="/icons/left_arrow.svg" alt="" />
                <a
                  href="#"
                  className="mt-5 bg-white text-gray-800 font-semibold py-4 px-8 rounded-full shadow-md transition-all duration-300 hover:shadow-lg hover:scale-105"
                >
                  Скачать для Андроид
                </a>
              </div>

              {/* Скачать для Айфон */}
              <div className="relative flex flex-col items-center">
                <img src="/icons/right_arrow.svg" alt="" />
                <a
                  href="#"
                  className="mt-5 bg-[#C0FAFF] text-gray-800 font-semibold py-4 px-8 rounded-full shadow-md border-2 border-white/30 transition-all duration-300 hover:shadow-lg hover:scale-105"
                >
                  Скачать для Айфон
                </a>
              </div>
            </div>

            {/* Уже скоро в */}
            <div className="flex flex-col items-center">
              <p className="text-lg font-semibold text-[#4A4A4A] mb-4">
                Уже скоро в:
              </p>
              <div className="flex gap-4 items-center">
                <img
                  src="/icons/soon_markets.svg"
                  alt="Google Play"
                  className="w-[100px] h-[100px] md:w-[120px] md:h-[120px] object-contain drop-shadow-md hover:scale-110 transition-transform duration-300"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Разделитель ИЛИ */}
      <div className="bg-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center gap-4 max-w-lg mx-auto">
            <div className="flex-1 h-px bg-gray-300"></div>
            <span className="text-gray-500 font-medium text-lg">ИЛИ</span>
            <div className="flex-1 h-px bg-gray-300"></div>
          </div>
        </div>
      </div>

      {/* Зарегистрируйтесь и используйте Веб-версию - Форма авторизации */}
      <section className="w-full bg-white flex items-center justify-center py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            {/* Заголовок */}
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-[#4A4A4A] leading-tight text-center mb-8 md:mb-12">
              Зарегистрируйтесь и используйте Веб-версию
            </h2>

            {/* Форма авторизации */}
            <form className="space-y-6">
              {/* Поле Email или номер телефона */}
              <div>
                <label className="block text-gray-600 mb-2 text-base">
                  Введите <span className="text-[#35B9C5]">email</span> или номер телефона
                </label>
                <input
                  type="text"
                  placeholder="example@email.com"
                  className="w-full px-6 py-4 bg-[#E8F4F8] rounded-xl border-none outline-none text-gray-700 text-lg focus:ring-2 focus:ring-[#35B9C5] transition-all duration-200"
                />
              </div>

              {/* Поле Пароль */}
              <div>
                <label className="block text-gray-600 mb-2 text-base">
                  Введите пароль
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full px-6 py-4 bg-[#E8F4F8] rounded-xl border-none outline-none text-gray-700 text-lg focus:ring-2 focus:ring-[#35B9C5] transition-all duration-200"
                />
              </div>

              {/* Кнопка Войти */}
              <button
                type="submit"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/login");
                }}
                className="w-full py-4 bg-[#35B9C5] text-white font-semibold text-lg rounded-full shadow-lg hover:bg-[#2fa8b3] hover:shadow-xl transition-all duration-300 mt-4"
              >
                Войти
              </button>

              {/* Ссылка на регистрацию */}
              <p className="text-center text-gray-600 mt-6">
                Если еще нет аккаунта, нажмите{" "}
                <button
                  type="button"
                  onClick={() => navigate("/register")}
                  className="text-gray-700 font-medium underline hover:text-[#35B9C5] transition-colors duration-200"
                >
                  Регистрация
                </button>
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#1E2530] text-white py-10 md:py-12">
        <div className="container mx-auto px-6 md:px-8">
          {/* Основной контент footer */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-10">
            {/* Логотип */}
            <div className="flex items-center">
              <span className="text-xl md:text-5xl font-bold text-white">
                Здраво
              </span>
            </div>

            {/* Навигация */}
            <nav className="flex flex-wrap justify-center gap-6 md:gap-10 text-base md:text-lg text-white">
              <a
                href="#"
                className="hover:text-gray-300 transition-colors duration-200"
              >
                О проекте
              </a>
              <a
                href="#"
                className="hover:text-gray-300 transition-colors duration-200"
              >
                Контакты
              </a>
              <a
                href="#"
                className="hover:text-gray-300 transition-colors duration-200"
              >
                Поддержка
              </a>
              <a
                href="#"
                className="hover:text-gray-300 transition-colors duration-200"
              >
                Политика конфиденциальности
              </a>
            </nav>

            {/* Кнопка скачать */}
            <button className="px-8 py-3 border-2 border-white rounded-xl text-white font-medium hover:bg-white hover:text-[#1E2530] transition-all duration-300">
              Скачать приложение
            </button>
          </div>

          {/* Копирайт */}
          <div className="text-center text-gray-400 text-base border-t border-gray-600 pt-8">
            © 2025 Здраво. Все права защищены.
          </div>
        </div>
      </footer>
    </div>
  );
};
