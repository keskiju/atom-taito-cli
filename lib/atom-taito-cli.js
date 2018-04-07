'use babel';

import AtomTaitoCliView from './atom-taito-cli-view';
import { CompositeDisposable } from 'atom';

export default {
  atomTaitoCliView: null,
  subscriptions: null,

  activate(state) {
    this.atomTaitoCliView = new AtomTaitoCliView(state.atomTaitoCliViewState);
    this.atomTaitoCliView.update({
      useAlternateScoring: true,
      preserveLastSearch: false
    });
    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'atom-taito-cli:toggle': () => this.atomTaitoCliView.toggle()
    }));
  },

  deactivate() {
    this.subscriptions.dispose();
    this.atomTaitoCliView.destroy();
  },
};
