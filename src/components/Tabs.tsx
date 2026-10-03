import React from 'react';
import { Send, Users, FileText, History } from 'lucide-react';

export type TabType = 'send' | 'students' | 'template' | 'history';

interface TabsProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  studentCount: number;
  historyCount: number;
  templateCount?: number;
}

export const Tabs: React.FC<TabsProps> = ({
  activeTab,
  onChangeTab,
  studentCount,
  historyCount,
  templateCount = 0,
}) => {
  const tabs = [
    { id: 'send' as TabType, label: 'Ana Gönderim', icon: Send },
    {
      id: 'students' as TabType,
      label: `Öğrenciler (${studentCount})`,
      icon: Users,
    },
    {
      id: 'template' as TabType,
      label: `Mesaj Şablonları ${templateCount > 0 ? `(${templateCount})` : ''}`,
      icon: FileText,
    },
    {
      id: 'history' as TabType,
      label: `Gönderim Geçmişi ${historyCount > 0 ? `(${historyCount})` : ''}`,
      icon: History,
    },
  ];

  return (
    <div className="border-b border-neutral-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 flex space-x-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              className={`flex items-center gap-2 py-3 text-xs font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-neutral-900 text-neutral-900 font-semibold'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-neutral-900' : 'text-neutral-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
