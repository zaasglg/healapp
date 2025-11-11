import { Outlet } from 'react-router-dom'

export const AuthLayout = () => {
  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Синий фон на всю высоту страницы (под белым блоком) */}
      <div className="absolute inset-0 bg-blue-primary">
        {/* Декоративный элемент слева */}
        <div className="absolute left-0 top-0 w-32 h-32 bg-blue-400 opacity-20 rounded-full -translate-x-1/2 -translate-y-1/2" />
      </div>
      
      {/* Голубая шапка с закругленными нижними углами */}
      <div className="h-32 relative z-0">
        <div className="absolute inset-0 bg-blue-primary rounded-b-[40px]"></div>
      </div>
      
      {/* Белый блок на всю ширину и до конца, перекрывает синий */}
      <div className="flex-1 bg-white rounded-t-[30px] -mt-8 relative z-10 px-4 pt-12 pb-8">
        <div className="max-w-md mx-auto">
          <Outlet />
        </div>
      </div>
    </div>
  )
}


