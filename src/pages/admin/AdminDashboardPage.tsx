import { Link } from 'react-router-dom'

const sections = [
  {
    to: '/admin/invites',
    title: 'Пригласительные ссылки',
    description: 'Создание и контроль одноразовых ссылок для организаций, сотрудников и клиентов.',
  },
  {
    to: '/admin/users',
    title: 'Пользователи и роли',
    description: 'Просмотр организаций, сотрудников и клиентов, анализ их активности.',
  },
  {
    to: '/admin/support',
    title: 'Помощь пользователям',
    description: 'Инструменты службы поддержки: просмотр дневников, правка данных и журнал действий.',
  },
  {
    to: '/admin/monitoring',
    title: 'Мониторинг и статистика',
    description: 'Показатели активности системы, проблемные события и аудит действий.',
  },
]

export const AdminDashboardPage = () => {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h2 className="text-2xl font-bold text-gray-800">Обзор панели управления</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map(section => (
          <Link
            key={section.to}
            to={section.to}
            className="group relative h-full bg-white border border-gray-200 rounded-3xl p-6 shadow-sm hover:shadow-lg transition-shadow"
          >
            <div className="flex flex-col h-full space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800 group-hover:text-[#0A6D83] transition-colors">
                  {section.title}
                </h3>
              </div>
              <p className="text-sm text-gray-600 flex-1 leading-relaxed">{section.description}</p>
              <span className="text-sm font-medium text-[#0A6D83] group-hover:translate-x-1 transition-transform">
                Перейти →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}


