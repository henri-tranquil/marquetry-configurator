import { TestBed } from '@angular/core/testing';
import { STORAGE_KEY } from '../core/model/project';
import { ProjectStore } from './project.store';

describe('ProjectStore', () => {
  let store: ProjectStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(ProjectStore);
  });

  it("démarre sur un panneau vide en médium quand rien n'est stocké", () => {
    expect(store.project().panel).toEqual({ w: 400, h: 700 });
    expect(store.project().zones).toEqual([]);
    expect(store.project().bg.mode).toBe('bois');
    expect(store.canUndo()).toBe(false);
  });

  it("une modification live ne crée pas d'entrée d'historique, commit si", () => {
    store.patch({ light: 100 });
    store.patch({ light: 120 });
    expect(store.canUndo()).toBe(false);
    store.commit();
    expect(store.canUndo()).toBe(true);
    store.undo();
    expect(store.project().light).toBe(35);
    expect(store.canRedo()).toBe(true);
    store.redo();
    expect(store.project().light).toBe(120);
  });

  it('commit sans changement ne pousse rien', () => {
    store.commit();
    expect(store.canUndo()).toBe(false);
  });

  it("limite l'historique à 100 entrées", () => {
    for (let i = 0; i < 120; i++) store.apply((p) => ({ ...p, light: i }));
    let n = 0;
    while (store.canUndo()) {
      store.undo();
      n++;
    }
    expect(n).toBe(100);
  });

  it("persiste l'état commité", () => {
    store.apply((p) => ({ ...p, sw: 7 }));
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).sw).toBe(7);
  });

  it('ajoute, duplique, supprime la sélection', () => {
    const n = store.project().zones.length;
    store.addShape('rect');
    const id = store.selectedId();
    expect(store.selected()?.type).toBe('rect');
    store.duplicateSelected();
    expect(store.project().zones).toHaveLength(n + 2);
    expect(store.selectedId()).not.toBe(id);
    store.deleteSelected();
    expect(store.project().zones).toHaveLength(n + 1);
    expect(store.selectedId()).toBeNull();
  });

  it('refuse un import invalide et normalise un import valide', () => {
    expect(store.importJson('pas du json')).toBe(false);
    expect(store.importJson('{"a":1}')).toBe(false);
    expect(store.importJson('{"panel":{"w":100,"h":100},"zones":[{"type":"rect","id":42}]}')).toBe(true);
    expect(store.project().zones[0]!.id).toBe(1);
  });

  it('désélectionne si la zone disparaît après annulation', () => {
    store.addShape('ellipse');
    store.undo();
    expect(store.selectedId()).toBeNull();
  });

  it('« Tout effacer » repart d\'un panneau en médium nu', () => {
    store.apply((p) => ({ ...p, bg: { ...p.bg, mode: 'paille' } }));
    store.clearZones();
    expect(store.project().bg.mode).toBe('bois');
    expect(store.project().zones).toEqual([]);
  });
});
