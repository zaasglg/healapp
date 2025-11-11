interface AdminPlaceholderPageProps {
  title: string
  description?: string
}

export const AdminPlaceholderPage = ({ title, description }: AdminPlaceholderPageProps) => {
  return (
    <div className="bg-white border border-dashed border-gray-300 rounded-3xl p-10 text-center space-y-4">
      <h2 className="text-2xl font-semibold text-gray-800">{title}</h2>
      <p className="text-sm text-gray-600 max-w-2xl mx-auto leading-relaxed">
        {description ||
          'Функциональность раздела находится в разработке. На следующих этапах здесь появятся инструменты для администраторов.'}
      </p>
      <p className="text-xs text-gray-400 uppercase tracking-wide">
        Шаг 12.2-12.5 — будет реализовано в ближайших задачах
      </p>
    </div>
  )
}


