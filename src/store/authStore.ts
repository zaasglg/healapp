import { create } from 'zustand'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: User | null
  session: Session | null
  isAuthenticated: boolean
  loading: boolean
  
  // Actions
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setLoading: (loading: boolean) => void
  checkAuth: () => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isAuthenticated: false,
  loading: true,

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  
  setSession: (session) => set({ 
    session,
    user: session?.user ?? null,
    isAuthenticated: !!session?.user,
  }),
  
  setLoading: (loading) => set({ loading }),

  checkAuth: async () => {
    try {
      set({ loading: true })
      
      // ВАЖНО: СНАЧАЛА проверяем Supabase сессию (приоритет для новых регистраций через Edge Function)
      // Это нужно, чтобы сотрудники, зарегистрированные через Edge Function, правильно определялись
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.user) {
          console.log('authStore.checkAuth: Found Supabase session:', {
            userId: session.user.id,
            email: session.user.email,
            organizationType: session.user.user_metadata?.organization_type,
            userRole: session.user.user_metadata?.user_role,
          })
          
          // ВАЖНО: Сначала проверяем organization_type (для организаций и сиделок)
          // Это приоритетнее, чем user_role, так как organization_type устанавливается при регистрации
          const organizationType = session.user.user_metadata?.organization_type
          
          // Если есть organization_type - это организация или сиделка (НЕ сотрудник, НЕ клиент)
          if (organizationType && ['pension', 'patronage_agency', 'caregiver'].includes(organizationType)) {
            // ВАЖНО: Проверяем, подтвержден ли email
            // Если email не подтвержден, пользователь не считается авторизованным
            // и должен ввести код подтверждения
            const isEmailConfirmed = session.user.email_confirmed_at !== null
            
            if (isEmailConfirmed) {
              // Если есть сессия Supabase и это организация/сиделка и email подтвержден - используем её и очищаем localStorage (чтобы не было конфликта)
              // ВАЖНО: НЕ удаляем local_invite_tokens и local_employees - они нужны для работы с сотрудниками
              localStorage.removeItem('current_user')
              localStorage.removeItem('auth_token')
              
              console.log('✅ authStore.checkAuth: Authenticated as ORGANIZATION/CAREGIVER via Supabase')
              set({
                session,
                user: session.user,
                isAuthenticated: true,
                loading: false,
              })
              return
            } else {
              // Email не подтвержден - пользователь не авторизован
              // Не очищаем сессию, но не считаем пользователя авторизованным
              console.log('⚠️ authStore.checkAuth: Email not confirmed for organization/caregiver')
              set({
                session: null,
                user: null,
                isAuthenticated: false,
                loading: false,
              })
              return
            }
          }
          
          // Если organization_type отсутствует, проверяем user_role
          // Сотрудники и клиенты теперь тоже работают через Supabase Auth (после регистрации через Edge Function)
          const userRole = session.user.user_metadata?.user_role
          const isEmployee = userRole === 'org_employee'
          const isClient = userRole === 'client'
          
          if (isEmployee || isClient) {
            // Сотрудники и клиенты теперь работают через Supabase Auth
            // Очищаем старый localStorage если он есть
            localStorage.removeItem('current_user')
            localStorage.removeItem('auth_token')
            
            console.log('✅ authStore.checkAuth: Authenticated as', isEmployee ? 'EMPLOYEE' : 'CLIENT', 'via Supabase')
            set({
              session,
              user: session.user,
              isAuthenticated: true,
              loading: false,
            })
            return
          }
        } else {
          console.log('authStore.checkAuth: No Supabase session found')
        }
      } catch (supabaseError) {
        // Если Supabase недоступен, продолжаем проверку localStorage
        console.log('authStore.checkAuth: Supabase unavailable, checking localStorage:', supabaseError)
      }
      
      // ТОЛЬКО если нет Supabase сессии, проверяем localStorage (для старых пользователей)
      const currentUser = localStorage.getItem('current_user')
      const authToken = localStorage.getItem('auth_token')
      
      console.log('authStore.checkAuth: Checking localStorage...', {
        hasCurrentUser: !!currentUser,
        hasAuthToken: !!authToken,
        currentUserLength: currentUser?.length || 0
      })
      
      if (currentUser && authToken && currentUser !== '{}') {
        try {
          const userData = JSON.parse(currentUser)
          const userRole = userData.user_role || userData.user_metadata?.user_role
          
          console.log('authStore.checkAuth: Parsed localStorage user:', {
            id: userData.id,
            role: userRole,
            phone: userData.phone,
            caregiver_id: userData.caregiver_id,
            organization_id: userData.organization_id
          })
          
          // Клиенты и сотрудники работают через localStorage (старый способ)
          if (userRole === 'client' || userRole === 'org_employee') {
            console.log('✅ authStore.checkAuth: Loading', userRole === 'client' ? 'CLIENT' : 'EMPLOYEE', 'from localStorage (legacy)')
            set({
              session: {
                user: userData,
                access_token: authToken,
              } as any,
              user: userData as any,
              isAuthenticated: true,
              loading: false,
            })
            return
          } else {
            console.log('⚠️ authStore.checkAuth: User role not client or employee:', userRole)
          }
        } catch (parseError) {
          console.error('❌ authStore.checkAuth: Error parsing current_user:', parseError)
        }
      } else {
        console.log('authStore.checkAuth: No valid localStorage data found')
      }
      
      // Если ничего не найдено
      set({
        session: null,
        user: null,
        isAuthenticated: false,
        loading: false,
      })
    } catch (error) {
      console.error('Error checking auth:', error)
      set({
        session: null,
        user: null,
        isAuthenticated: false,
        loading: false,
      })
    }
  },

  logout: async () => {
    try {
      // Очищаем localStorage для сотрудников
      localStorage.removeItem('current_user')
      localStorage.removeItem('auth_token')
      
      // Выход из Supabase для организаций/сиделок
      try {
        await supabase.auth.signOut()
      } catch (error) {
        // Игнорируем ошибку если Supabase недоступен
      }
      
      set({
        user: null,
        session: null,
        isAuthenticated: false,
      })
    } catch (error) {
      console.error('Error logging out:', error)
    }
  },
}))


