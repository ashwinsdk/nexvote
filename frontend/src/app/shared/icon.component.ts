import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Shield, Globe, Bot, Lock, BarChart3, Zap, AlertCircle, Home, Users, FileText, Plus, ChevronRight, Check, X, LogOut, User, Menu, Search } from 'lucide-angular';

@Component({
    selector: 'nv-icon',
    standalone: true,
    imports: [CommonModule, LucideAngularModule],
    template: `
    <lucide-angular
      [img]="getIcon()"
      [size]="size"
      [class]="iconClass"
      [strokeWidth]="strokeWidth"
    ></lucide-angular>
  `,
    styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
  `]
})
export class IconComponent {
    @Input() name: string = 'home';
    @Input() size: number = 24;
    @Input() strokeWidth: number = 2;
    @Input() iconClass: string = '';

    // Icon mapping
    private icons: any = {
        shield: Shield,
        globe: Globe,
        bot: Bot,
        lock: Lock,
        chart: BarChart3,
        zap: Zap,
        alert: AlertCircle,
        home: Home,
        users: Users,
        file: FileText,
        plus: Plus,
        'chevron-right': ChevronRight,
        check: Check,
        x: X,
        logout: LogOut,
        user: User,
        menu: Menu,
        search: Search,
    };

    getIcon() {
        return this.icons[this.name] || this.icons['home'];
    }
}
