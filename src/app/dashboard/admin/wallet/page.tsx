import AdminWalletKycDashboard from '@/features/wallet/components/AdminWalletKycDashboard';

export const metadata = {
  title: 'Wallet KYC Approvals | Admin Dashboard',
};

export default function AdminWalletKycPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <AdminWalletKycDashboard />
    </div>
  );
}
