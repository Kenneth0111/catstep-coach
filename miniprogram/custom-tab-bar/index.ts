Component({
  data: {
    activePath: '',
  },

  pageLifetimes: {
    show() {
      this.updateActivePath();
    },
  },

  lifetimes: {
    attached() {
      this.updateActivePath();
    },
  },

  methods: {
    updateActivePath() {
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1] as { route?: string } | undefined;
      this.setData({ activePath: currentPage ? `/${currentPage.route}` : '' });
    },
  },
});
