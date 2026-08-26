const scenes = {};

export const sceneManager = {
  current: null,
  next: null,
  register(name, sceneObj) {
    scenes[name] = sceneObj;
  },
  go(name, params) {
    this.next = { name, params };
  },
  updateSceneTransition() {
    if (this.next) {
      if (this.current && typeof this.current.exit === "function") {
        try {
          this.current.exit();
        } catch (e) {
          console.error("[SceneManager] Error in scene exit:", e);
        }
      }
      const nextScene = scenes[this.next.name];
      if (nextScene) {
        this.current = nextScene;
        if (typeof this.current.enter === "function") {
          try {
            this.current.enter(this.next.params);
          } catch (e) {
            console.error("[SceneManager] Error in scene enter:", e);
          }
        }
      } else {
        console.error(`[SceneManager] Scene not found: ${this.next.name}`);
      }
      this.next = null;
    }
  },
};

export function go(name, params) {
  sceneManager.go(name, params);
}
