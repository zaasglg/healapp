import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui'

type MessengerType = 'whatsapp' | 'telegram' | 'max'

export const InviteClientPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showMessengerModal, setShowMessengerModal] = useState(false)

  useEffect(() => {
    // Проверяем, что пользователь - частная сиделка
    if (!user) {
      navigate('/login')
      return
    }

    const userType = user.user_metadata?.organization_type
    if (userType !== 'caregiver') {
      navigate('/profile')
      return
    }
  }, [user, navigate])

  const generateToken = () => {
    // Генерируем уникальный токен
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
  }

  const createInviteLink = async () => {
    if (!user) return

    setIsCreating(true)
    try {
      // Временное решение: используем user.id как caregiver_id
      // Для сиделки caregiver_id = user.id (так как сиделка - это организация с типом 'caregiver')
      // TODO: После создания таблицы organizations в БД, можно будет получать id из таблицы:
      /*
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', 'caregiver')
        .single()

      if (orgError || !orgData) {
        console.error('Error loading caregiver:', orgError)
        alert('Ошибка при создании ссылки. Попробуйте позже.')
        setIsCreating(false)
        return
      }
      const caregiverId = orgData.id
      */
      
      // Временное решение: используем user.id как caregiver_id
      const caregiverId = user.id

      const token = generateToken()
      
      // TODO: После создания таблицы caregiver_client_invite_tokens в БД, раскомментировать:
      /*
      const { error: insertError } = await supabase
        .from('caregiver_client_invite_tokens')
        .insert({
          token,
          caregiver_id: caregiverId,
          created_by: user.id,
        })

      if (insertError) {
        console.error('Error creating invite token:', insertError)
        alert('Ошибка при создании ссылки. Попробуйте позже.')
        setIsCreating(false)
        return
      }
      */

      // Временное решение: сохраняем в localStorage
      const inviteTokens = JSON.parse(localStorage.getItem('caregiver_client_invite_tokens') || '[]')
      inviteTokens.push({
        id: `temp_${Date.now()}`,
        token,
        caregiver_id: caregiverId, // Используем user.id как caregiver_id
        created_by: user.id,
        created_at: new Date().toISOString(),
        used_at: null,
        used_by: null,
      })
      localStorage.setItem('caregiver_client_invite_tokens', JSON.stringify(inviteTokens))

      const link = `${window.location.origin}/client-invite?token=${token}`
      setInviteLink(link)
    } catch (err) {
      console.error('Error creating invite link:', err)
      alert('Ошибка при создании ссылки. Попробуйте позже.')
    } finally {
      setIsCreating(false)
    }
  }

  const copyToClipboard = async () => {
    if (!inviteLink) return

    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Error copying to clipboard:', err)
      alert('Не удалось скопировать ссылку')
    }
  }

  const getInviteMessage = () => {
    return `Приглашаю вас в удобную систему для отслеживания здоровья вашего родственника! ${inviteLink}`
  }

  const shareToMessenger = (messenger: MessengerType) => {
    if (!inviteLink) return

    const message = getInviteMessage()
    let shareUrl = ''

    switch (messenger) {
      case 'whatsapp':
        shareUrl = `https://wa.me/?text=${encodeURIComponent(message)}`
        break
      case 'telegram':
        shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(message)}`
        break
      case 'max':
        // Используем формат для отправки сообщения человеку (не боту)
        shareUrl = `https://web.max.ru/share?text=${encodeURIComponent(message)}`
        break
    }

    if (shareUrl) {
      window.open(shareUrl, '_blank')
      setShowMessengerModal(false)
    }
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
            Пригласить клиента
          </h1>
        </div>
      </header>

      <div className="flex-1 max-w-md mx-auto w-full px-4 pb-8">
        <div className="mt-6">
          <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-dark mb-4">
              Создать пригласительную ссылку
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              Создайте ссылку для приглашения клиента. Клиент сможет зарегистрироваться и создать карточку подопечного.
            </p>

            {!inviteLink ? (
              <Button
                onClick={createInviteLink}
                disabled={isCreating}
                fullWidth
                size="lg"
              >
                {isCreating ? 'Создание ссылки...' : 'Создать ссылку'}
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-manrope text-gray-500 mb-2">
                    Пригласительная ссылка:
                  </p>
                  <p className="text-sm font-mono text-gray-800 break-all">
                    {inviteLink}
                  </p>
                </div>

                <div className="space-y-3">
                  <Button
                    onClick={copyToClipboard}
                    variant="outline"
                    fullWidth
                  >
                    {copied ? 'Скопировано!' : 'Копировать ссылку'}
                  </Button>
                  <Button
                    onClick={() => setShowMessengerModal(true)}
                    fullWidth
                  >
                    Поделиться в мессенджере
                  </Button>
                </div>

                <Button
                  onClick={() => {
                    setInviteLink(null)
                    setCopied(false)
                  }}
                  variant="outline"
                  fullWidth
                >
                  Создать новую ссылку
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Модальное окно выбора мессенджера */}
      {showMessengerModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowMessengerModal(false)}
        >
          <div 
            className="bg-white rounded-2xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-dark mb-4">
              Выберите мессенджер
            </h3>
            <div className="space-y-3">
              <button
                onClick={() => shareToMessenger('whatsapp')}
                className="w-full p-4 bg-[#25D366] text-white rounded-xl font-medium hover:bg-opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                WhatsApp
              </button>
              <button
                onClick={() => shareToMessenger('telegram')}
                className="w-full p-4 bg-[#0088cc] text-white rounded-xl font-medium hover:bg-opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                Telegram
              </button>
              <button
                onClick={() => shareToMessenger('max')}
                className="w-full p-4 bg-[#00A3FF] text-white rounded-xl font-medium hover:bg-opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                  <span className="text-[#00A3FF] font-bold text-sm">M</span>
                </div>
                Макс
              </button>
            </div>
            <button
              onClick={() => setShowMessengerModal(false)}
              className="mt-4 w-full p-3 bg-gray-200 text-gray-dark hover:bg-gray-300 transition-colors rounded-2xl font-medium"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

