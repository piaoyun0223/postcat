import { KeyValue } from '@angular/common';
import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, TemplateRef } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { NzContextMenuService, NzDropdownMenuComponent } from 'ng-zorro-antd/dropdown';
import { NzTabsCanDeactivateFn } from 'ng-zorro-antd/tabs';
import { TabOperateService } from 'pc/browser/src/app/components/eo-ui/tab/tab-operate.service';
import { TabStorageService } from 'pc/browser/src/app/components/eo-ui/tab/tab-storage.service';
import { TabItem, TabOperate } from 'pc/browser/src/app/components/eo-ui/tab/tab.model';
import { TraceService } from 'pc/browser/src/app/services/trace.service';
import { StoreService } from 'pc/browser/src/app/shared/store/state.service';
import { filter, Subscription } from 'rxjs';

import { ModalService } from '../../../services/modal.service';
@Component({
  selector: 'eo-tab',
  templateUrl: './tab.component.html',
  styleUrls: ['./tab.component.scss']
})
export class EoTabComponent implements OnInit, OnDestroy {
  @Input() list: Array<Partial<TabItem>>;
  @Input() tabStorageKey = 'DEFAULT_TAB_STORAGE_KEY';

  @Input() addDropDown?: NzDropdownMenuComponent;
  @Input() titleLabel?: TemplateRef<void>;

  @Input() checkTabCanLeave?: (closeTarget?: TabItem) => boolean;
  @Input() handleDataBeforeCache?: <T>({ tabsByID: T }) => T;
  @Input() handleDataBeforeGetCache?;
  @Output() readonly beforeClose = new EventEmitter<boolean>();
  MAX_TAB_LIMIT = 15;
  routerSubscribe: Subscription;
  constructor(
    public tabStorage: TabStorageService,
    public tabOperate: TabOperateService,
    private modal: ModalService,
    private router: Router,
    public store: StoreService,
    private trace: TraceService,
    private nzContextMenuService: NzContextMenuService
  ) {}
  contextMenu($event: MouseEvent, menu: NzDropdownMenuComponent, tabID): void {
    this.nzContextMenuService.create($event, menu);
  }
  ngOnInit(): void {
    this.watchRouterChange();
    this.watchPageLeave();

    this.tabStorage.init({
      tabStorageKey: this.tabStorageKey
    });
    this.tabOperate.init({
      basicTabs: this.list,
      handleDataBeforeGetCache: this.handleDataBeforeGetCache
    });
  }

  async newTab(key = undefined) {
    if (this.checkTabCanLeave && !(await this.checkTabCanLeave())) {
      return false;
    }
    if (this.tabStorage.tabOrder.length >= this.MAX_TAB_LIMIT) {
      return;
    }
    // * Trace
    this.trace.report('open_api_test');
    this.tabOperate.newDefaultTab(key);
  }
  doubleClickTab($event, uuid) {
    this.tabStorage.tabsByID.get(uuid).isFixed = true;
  }
  sortTab(_left: KeyValue<number, any>, _right: KeyValue<number, any>): number {
    const leftIndex = this.tabStorage.tabOrder.findIndex(uuid => uuid === _left.key);
    const rightIndex = this.tabStorage.tabOrder.findIndex(uuid => uuid === _right.key);
    return leftIndex - rightIndex;
  }
  canDeactivate: NzTabsCanDeactivateFn = async (fromIndex: number, toIndex: number) => {
    if (this.checkTabCanLeave && !(await this.checkTabCanLeave())) {
      return false;
    }
    return true;
  };
  /**
   * Select tab
   */
  selectChange($event) {
    this.tabOperate.navigateByTab(this.getCurrentTab());
  }
  async closeTab({ $event, index, tab }: { $event: Event; index: number; tab: any }) {
    if (this.checkTabCanLeave && !(await this.checkTabCanLeave(tab))) {
      return;
    }
    $event.stopPropagation();
    if (!tab?.hasChanged) {
      this.tabOperate.closeTab(index);
      return;
    }
    const modal = this.modal.create({
      nzTitle: $localize`Do you want to save the changes?`,
      nzContent: $localize`Your changes will be lost if you don't save them.`,
      nzClosable: false,
      nzAutofocus: false,
      nzFooter: [
        {
          label: $localize`Cancel`,
          onClick: () => {
            modal.destroy();
          }
        },

        {
          label: $localize`Don't Save`,
          onClick: () => {
            this.beforeClose.emit(false);
            modal.destroy();
            this.tabOperate.closeTab(index);
          }
        },
        {
          label: $localize`Save`,
          type: 'primary',
          onClick: () => {
            this.beforeClose.emit(true);
            modal.destroy();
            this.tabOperate.closeTab(index);
          }
        }
      ]
    });
  }
  //Quick see tabs change in template,for debug,can be deleted
  // ! just for debug
  getConsoleTabs() {
    const tabs = [];
    this.tabStorage.tabOrder.forEach(uuid => {
      const tab = this.tabStorage.tabsByID.get(uuid);
      if (!tab) {
        return;
      }
      tabs.push({
        baseContent: tab.baseContent,
        uuid: tab.uuid,
        type: tab.type,
        title: tab.title,
        pathname: tab.pathname,
        params: tab.params
      });
    });
    return tabs;
  }
  getTabs() {
    const tabs = [];
    this.tabStorage.tabOrder.forEach(uuid => tabs.push(this.tabStorage.tabsByID.get(uuid)));
    return tabs;
  }
  /**
   * Get tab by tab id
   *
   * @param uuid
   */
  getTabByID(uuid: TabItem['uuid']) {
    return this.tabStorage.tabsByID.get(uuid);
  }
  /**
   * Get Tab id by child component resource id
   *
   * @param uuid queryParams uuid
   * @returns
   */
  getTabByParamsID(uuid: TabItem['params']['uuid']) {
    const tabID = this.tabStorage.tabOrder.find(tabID => this.tabStorage.tabsByID.get(tabID)?.params?.uuid === uuid);
    return this.tabStorage.tabsByID.get(tabID);
  }
  getCurrentTab() {
    return this.tabOperate.getCurrentTab();
  }
  batchCloseTab(uuids) {
    this.tabOperate.batchClose(uuids);
  }
  /**
   * update tab
   *
   * @param uuid tab uuid
   * @param tabItem
   * @returns
   */
  updatePartialTab(uuid: string | number, tabItem: Partial<TabItem>) {
    const existTab = this.getTabByID(uuid);
    if (!existTab) {
      pcConsole.error(`:updatePartialTab fail,can't find exist tab to fixed uuid:${uuid}`);
      return;
    }
    const index = this.tabStorage.tabOrder.findIndex(uuid => uuid === existTab.uuid);
    this.tabStorage.updateTab(index, {
      ...existTab,
      ...tabItem,
      extends: { ...existTab.extends, ...tabItem.extends }
    });
    // console.log('updatePartialTabSuccess', this.tabStorage.tabsByID.get(uuid));
  }
  /**
   * Cache tab header/tabs content for restore when page close or component destroy
   */
  cacheData() {
    this.tabStorage.setPersistenceStorage(this.tabOperate.selectedIndex, {
      handleDataBeforeCache: this.handleDataBeforeCache
    });
  }
  checkIsFirstTab(uuid) {
    return this.tabStorage.tabOrder.findIndex(val => val === uuid) === 0;
  }
  checkIsLastTab(uuid) {
    return this.tabStorage.tabOrder.length - 1 === this.tabStorage.tabOrder.findIndex(val => val === uuid);
  }
  /**
   * Tab  Close Operate
   *
   * @param action
   */
  closeTabByOperate(action: TabOperate | string, uuid?) {
    this.tabOperate.closeTabByOperate(action, uuid);
  }
  private watchRouterChange() {
    this.routerSubscribe = this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe((res: NavigationEnd) => {
      this.tabOperate.operateTabAfterRouteChange(res);
    });
  }
  ngOnDestroy(): void {
    this.routerSubscribe?.unsubscribe();
    this.cacheData();
  }
  private watchPageLeave = () => {
    window.addEventListener('beforeunload', e => {
      this.cacheData();
    });
  };
}
