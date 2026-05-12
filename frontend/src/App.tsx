import { Fragment } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AdminLayout } from './layouts/AdminLayout'
import { StoreLayout } from './layouts/StoreLayout'
import { AdminDepositPage } from './pages/admin/AdminDepositPage'
import { AdminDisputesPage } from './pages/admin/AdminDisputesPage'
import { AdminDiscountsPage } from './pages/admin/AdminDiscountsPage'
import { AdminLiquorHoursPage } from './pages/admin/AdminLiquorHoursPage'
import { AdminFulfillmentPage } from './pages/admin/AdminFulfillmentPage'
import { AdminHomePage } from './pages/admin/AdminHomePage'
import { AdminInventoryPage } from './pages/admin/AdminInventoryPage'
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage'
import { AdminReturnsPage } from './pages/admin/AdminReturnsPage'
import { AdminOrderReviewsPage } from './pages/admin/AdminOrderReviewsPage'
import { AdminProductsPage } from './pages/admin/AdminProductsPage'
import { AdminCategoriesPage } from './pages/admin/AdminCategoriesPage'
import { AdminLoginPage } from './pages/admin/AdminLoginPage'
import { RequireAdminStaff } from './pages/admin/RequireAdminStaff'
import { AccountPage } from './pages/store/AccountPage'
import { CartPage } from './pages/store/CartPage'
import { CheckoutPage } from './pages/store/CheckoutPage'
import { CheckoutSuccessPage } from './pages/store/CheckoutSuccessPage'
import { CheckoutFailurePage } from './pages/store/CheckoutFailurePage'
import { CheckoutCompletePage } from './pages/store/CheckoutCompletePage'
import { ForgotPasswordPage } from './pages/store/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/store/ResetPasswordPage'
import { OrdersListPage } from './pages/store/OrdersListPage'
import { OrderDetailPage } from './pages/store/OrderDetailPage'
import { OrderDisputePage } from './pages/store/OrderDisputePage'
import { OrderReviewPage } from './pages/store/OrderReviewPage'
import { ReturnRequestPage } from './pages/store/ReturnRequestPage'
import { TrackOrderPage } from './pages/store/TrackOrderPage'
import { ProductPage } from './pages/store/ProductPage'
import { PaymentsCategoryPage } from './pages/payments/PaymentsCategoryPage'
import { ScanPage } from './pages/store/ScanPage'
import { ScanPayCodePage } from './pages/store/ScanPayCodePage'
import { ScanReceiveQrPage } from './pages/store/ScanReceiveQrPage'
import { ScanMyQrPage } from './pages/store/ScanMyQrPage'
import { ShopPage } from './pages/store/ShopPage'
import { StoreHomePage } from './pages/store/StoreHomePage'
import { APP_DISPLAY_NAME } from './theme/branding'
import { HubPaymentDemoFlowPage } from './pages/demo/HubPaymentDemoFlowPage'
import { servicesEssentialsHref } from './lib/servicesHubTabs'
import { ServicesPage } from './pages/services/ServicesPage'
import { InsuranceFlowPage } from './pages/services/InsuranceFlowPage'
import { ProfileHubPage } from './pages/profile/ProfileHubPage'
import { ProfilePersonalPage } from './pages/profile/ProfilePersonalPage'
import { ProfileConfirmEmailPage } from './pages/profile/ProfileConfirmEmailPage'
import { ProfileSupportPage } from './pages/profile/ProfileSupportPage'
import { ProfileFaqPage } from './pages/profile/ProfileFaqPage'
import { ProfileFeedbackPage } from './pages/profile/ProfileFeedbackPage'
import { ProfileFeedbackSentPage } from './pages/profile/ProfileFeedbackSentPage'
import { ProfileSettingsPage } from './pages/profile/ProfileSettingsPage'
import { ProfileLegalPage } from './pages/profile/ProfileLegalPage'
import { ProfileDeleteAccountPage } from './pages/profile/ProfileDeleteAccountPage'
import { ProfileAddressesPage } from './pages/profile/ProfileAddressesPage'
import { NotificationsPage } from './pages/notifications/NotificationsPage'
import { NotificationDetailPage } from './pages/notifications/NotificationDetailPage'
import { ClassifiedsHomePage } from './pages/classifieds/ClassifiedsHomePage'
import { ClassifiedsAdDetailPage } from './pages/classifieds/ClassifiedsAdDetailPage'
import { ClassifiedsPostAdPage } from './pages/classifieds/ClassifiedsPostAdPage'
import { WalletActionPlaceholderPage } from './pages/wallet/WalletActionPlaceholderPage'
import { WalletBankPage } from './pages/wallet/WalletBankPage'
import { WalletCardFormPage } from './pages/wallet/WalletCardFormPage'
import { WalletCardsPage } from './pages/wallet/WalletCardsPage'
import { WalletFeaturePlaceholderPage } from './pages/wallet/WalletFeaturePlaceholderPage'
import { WalletHomePage } from './pages/wallet/WalletHomePage'
import { WalletPayTodayPage } from './pages/wallet/WalletPayTodayPage'
import { WalletRewardsPage } from './pages/wallet/WalletRewardsPage'
import { WalletTransactionDetailPage } from './pages/wallet/WalletTransactionDetailPage'
import { WalletTransactionsPage } from './pages/wallet/WalletTransactionsPage'
import { WalletVouchersFlowPage } from './pages/wallet/WalletVouchersFlowPage'
import { IntroCarouselPage } from './pages/onboarding/IntroCarouselPage'
import { OnboardingLoadingPage } from './pages/onboarding/OnboardingLoadingPage'
import { OnboardingLoginPage } from './pages/onboarding/OnboardingLoginPage'
import { OnboardingCompleteProfilePage } from './pages/onboarding/OnboardingCompleteProfilePage'
import { OnboardingPermissionsPage } from './pages/onboarding/OnboardingPermissionsPage'
import { OnboardingAddCardFlowPage } from './pages/onboarding/OnboardingAddCardFlowPage'
import { OnboardingAddBankFlowPage } from './pages/onboarding/OnboardingAddBankFlowPage'

function shopBillPayHref(pathPrefix: string) {
  const base = pathPrefix ? `${pathPrefix}/shop` : '/shop'
  return `${base}#shop-bill-pay`
}

/** `/payments` hub removed — land on Store with bill-pay section. */
function PaymentsRootRedirect() {
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  return <Navigate to={shopBillPayHref(pathPrefix)} replace />
}

/** Old URLs `/payments/category/:slug` → `/payments/:slug` */
function LegacyPaymentsCategoryRedirect() {
  const { categoryId } = useParams<{ categoryId: string }>()
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const slug = categoryId?.trim() ?? ''
  if (!slug) return <Navigate to={shopBillPayHref(pathPrefix)} replace />
  return <Navigate to={`${pathPrefix}/payments/${slug}`} replace />
}

/** Old `/scan` URLs → `/wallet/scan` (scan lives under Wallet). */
function ScanLegacyRedirect() {
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const rel = pathname.startsWith('/embed') ? pathname.slice('/embed'.length) || '/' : pathname
  const m = rel.match(/^\/scan(?:\/(.*))?$/)
  const tail = (m?.[1] ?? '').replace(/^\/+|\/+$/gu, '')
  const suffix = tail ? `/${tail}` : ''
  const dest = (m ? `${pathPrefix}/wallet/scan${suffix}` : `${pathPrefix}/wallet/scan`).replace(/\/+/g, '/')
  return <Navigate to={dest} replace />
}

/** Legacy `/services` → essentials hub (bottom nav uses `/services/essentials`). */
function ServicesHubRootRedirect() {
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  return <Navigate to={servicesEssentialsHref(pathPrefix)} replace />
}

/** Shared storefront routes — must be `<Route>` nodes inside `<Fragment>`, not a custom component (React Router 7). */
function storeRouteElements(withHome: boolean) {
  return (
    <Fragment>
      {withHome ? <Route index element={<StoreHomePage />} /> : null}
      <Route path="intro" element={<IntroCarouselPage />} />
      <Route path="onboarding/loading" element={<OnboardingLoadingPage />} />
      <Route path="onboarding/login" element={<OnboardingLoginPage />} />
      <Route path="forgot-password" element={<ForgotPasswordPage />} />
      <Route path="reset-password" element={<ResetPasswordPage />} />
      <Route path="onboarding/complete-profile" element={<OnboardingCompleteProfilePage />} />
      <Route path="onboarding/permissions" element={<OnboardingPermissionsPage />} />
      <Route path="onboarding/add-card" element={<OnboardingAddCardFlowPage />} />
      <Route path="onboarding/add-bank" element={<OnboardingAddBankFlowPage />} />
      <Route path="shop" element={<ShopPage />} />
      <Route path="shop/:slug" element={<ProductPage />} />
      <Route path="scan/*" element={<ScanLegacyRedirect />} />
      <Route path="services" element={<ServicesHubRootRedirect />} />
      <Route path="services/essentials" element={<ServicesPage />} />
      <Route path="services/more" element={<ServicesHubRootRedirect />} />
      <Route path="services/insurance" element={<InsuranceFlowPage />} />
      <Route path="services/:slug" element={<HubPaymentDemoFlowPage variant="services" />} />
      <Route path="profile" element={<ProfileHubPage />} />
      <Route path="profile/personal" element={<ProfilePersonalPage />} />
      <Route path="profile/addresses" element={<ProfileAddressesPage />} />
      <Route path="profile/confirm-email" element={<ProfileConfirmEmailPage />} />
      <Route path="profile/support" element={<ProfileSupportPage />} />
      <Route path="profile/faq" element={<ProfileFaqPage />} />
      <Route path="profile/feedback" element={<ProfileFeedbackPage />} />
      <Route path="profile/feedback/sent" element={<ProfileFeedbackSentPage />} />
      <Route path="profile/settings" element={<ProfileSettingsPage />} />
      <Route path="profile/legal" element={<ProfileLegalPage />} />
      <Route path="profile/delete-account" element={<ProfileDeleteAccountPage />} />
      <Route path="notifications" element={<NotificationsPage />} />
      <Route path="notifications/:id" element={<NotificationDetailPage />} />
      <Route path="classifieds" element={<ClassifiedsHomePage />} />
      <Route path="classifieds/post" element={<ClassifiedsPostAdPage />} />
      <Route path="classifieds/:id" element={<ClassifiedsAdDetailPage />} />
      <Route path="payments" element={<PaymentsRootRedirect />} />
      <Route path="payments/category/:categoryId" element={<LegacyPaymentsCategoryRedirect />} />
      <Route path="payments/:categoryId/pay/:itemId" element={<HubPaymentDemoFlowPage variant="payments" />} />
      <Route path="payments/:categoryId" element={<PaymentsCategoryPage />} />
      <Route path="cart" element={<CartPage />} />
      <Route path="checkout" element={<CheckoutPage />} />
      <Route path="checkout/success" element={<CheckoutSuccessPage />} />
      <Route path="checkout/failure" element={<CheckoutFailurePage />} />
      <Route path="checkout/complete" element={<CheckoutCompletePage />} />
      <Route path="orders" element={<OrdersListPage />} />
      <Route path="orders/track" element={<TrackOrderPage />} />
      <Route path="orders/:orderId/return" element={<ReturnRequestPage />} />
      <Route path="orders/:orderId/dispute" element={<OrderDisputePage />} />
      <Route path="orders/:orderId/review" element={<OrderReviewPage />} />
      <Route path="orders/:orderId" element={<OrderDetailPage />} />
      <Route path="account" element={<AccountPage />} />
      <Route path="wallet/scan/pay-code" element={<ScanPayCodePage />} />
      <Route path="wallet/scan/receive-qr" element={<ScanReceiveQrPage />} />
      <Route path="wallet/scan/my-qr" element={<ScanMyQrPage />} />
      <Route path="wallet/scan" element={<ScanPage />} />
      <Route path="wallet" element={<WalletHomePage />} />
      <Route path="wallet/rewards" element={<WalletRewardsPage />} />
      <Route path="wallet/paytoday" element={<WalletPayTodayPage />} />
      <Route path="wallet/paytoday/:action" element={<WalletActionPlaceholderPage />} />
      <Route path="wallet/cards" element={<WalletCardsPage />} />
      <Route path="wallet/cards/:cardId" element={<WalletCardFormPage />} />
      <Route path="wallet/bank" element={<WalletBankPage />} />
      <Route path="wallet/transactions" element={<WalletTransactionsPage />} />
      <Route path="wallet/transactions/:txId" element={<WalletTransactionDetailPage />} />
      <Route
        path="wallet/request-payment"
        element={
          <WalletFeaturePlaceholderPage
            title="Request a Payment"
            body={`Generate a payment link or QR for someone to pay you. Available when ${APP_DISPLAY_NAME} request-money is enabled for your account.`}
          />
        }
      />
      <Route
        path="wallet/split-bill"
        element={
          <WalletFeaturePlaceholderPage
            title="Split your bill"
            body={`Split expenses with friends and collect your share. This feature will use ${APP_DISPLAY_NAME} split payments when connected.`}
          />
        }
      />
      <Route
        path="wallet/vouchers"
        element={<WalletVouchersFlowPage />}
      />
      <Route
        path="wallet/cashout"
        element={
          <WalletFeaturePlaceholderPage
            title="Cashout"
            body={`Cash out wallet balance to cash agents or linked accounts per ${APP_DISPLAY_NAME} rules.`}
          />
        }
      />
    </Fragment>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<StoreLayout />}>{storeRouteElements(true)}</Route>

      <Route path="embed" element={<StoreLayout />}>
        <Route index element={<Navigate to="shop" replace />} />
        {storeRouteElements(false)}
      </Route>

      <Route path="admin/login" element={<AdminLoginPage />} />
      <Route element={<RequireAdminStaff />}>
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<AdminHomePage />} />
          <Route path="products" element={<AdminProductsPage />} />
          <Route path="categories" element={<AdminCategoriesPage />} />
          <Route path="orders" element={<AdminOrdersPage />} />
          <Route path="returns" element={<AdminReturnsPage />} />
          <Route path="disputes" element={<AdminDisputesPage />} />
          <Route path="reviews" element={<AdminOrderReviewsPage />} />
          <Route path="inventory" element={<AdminInventoryPage />} />
          <Route path="fulfillment" element={<AdminFulfillmentPage />} />
          <Route path="deposit-boxes" element={<AdminDepositPage />} />
          <Route path="discounts" element={<AdminDiscountsPage />} />
          <Route path="liquor-hours" element={<AdminLiquorHoursPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
