import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

interface Client {
  id: string
  first_name: string
  last_name: string
  phone: string
  created_at: string
}

export const ClientsPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [clients, setClients] = useState<Client[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadClients = async () => {
      if (!user) {
        navigate('/login')
        return
      }

      try {
        // Получаем organization_id из organizations таблицы (с таймаутом)
        let organizationId: string | null = null
        
        try {
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 2000) // 2 секунды таймаут
          )
          
          const orgPromise = supabase
            .from('organizations')
            .select('id')
            .eq('user_id', user.id)
            .single()

          const { data: orgData, error: orgError } = await Promise.race([orgPromise, timeoutPromise]) as any

          if (!orgError && orgData) {
            organizationId = orgData.id
          } else {
            console.log('Organization not found or timeout, using localStorage')
            setIsLoading(false)
            return
          }
        } catch (err) {
          console.log('DB query timeout or error, using localStorage')
          setIsLoading(false)
          return
        }

        // Загружаем клиентов, которые зарегистрировались по пригласительной ссылке организации
        const { data: clientsData, error: clientsError } = await supabase
          .from('clients')
          .select('id, first_name, last_name, phone, created_at, user_id')
          .eq('invited_by_organization_id', organizationId)
          .order('created_at', { ascending: false })

        if (clientsError) {
          console.error('Ошибка загрузки клиентов:', clientsError)
          setClients([])
        } else {
          // Преобразуем данные в нужный формат
          const formattedClients: Client[] = (clientsData || []).map((client: any) => ({
            id: client.id,
            first_name: client.first_name || '',
            last_name: client.last_name || '',
            phone: client.phone || '',
            created_at: client.created_at,
          }))
          setClients(formattedClients)
          console.log('[ClientsPage] Загружено клиентов:', formattedClients.length)
        }
      } catch (err) {
        console.error('Error loading clients:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadClients()
  }, [user, navigate])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка клиентов...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white">
        <div className="flex items-center px-4 py-3 relative">
          <button
            onClick={() => navigate('/profile')}
            className="mr-4 p-2 -ml-2"
            aria-label="Назад"
          >
            <img 
              src="/icons/Иконка стрелка.png" 
              alt="Назад" 
              className="w-6 h-6 object-contain"
            />
          </button>
          <h1 className="absolute left-1/2 transform -translate-x-1/2 text-lg font-bold text-gray-dark">
            Клиенты
          </h1>
        </div>
      </header>

      <div className="flex-1 max-w-md mx-auto w-full px-4 pb-8">
        <div className="mt-6">
          {clients.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-md p-8 text-center">
              <p className="text-gray-600 mb-4">
                Список клиентов пуст
              </p>
              <p className="text-sm text-gray-500">
                Клиенты появятся здесь после того, как они зарегистрируются по вашей пригласительной ссылке
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {clients.map((client) => {
                // Форматируем дату регистрации
                const registrationDate = client.created_at
                  ? new Date(client.created_at).toLocaleDateString('ru-RU', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : null

                return (
                  <div
                    key={client.id}
                    className="bg-white rounded-2xl shadow-md p-5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-lg font-bold text-gray-dark mb-1">
                          {client.first_name} {client.last_name}
                        </p>
                        {client.phone && (
                          <p className="text-xs font-manrope text-gray-500 mb-1">
                            {client.phone}
                          </p>
                        )}
                        {registrationDate && (
                          <p className="text-xs font-manrope text-gray-400">
                            Зарегистрирован: {registrationDate}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

