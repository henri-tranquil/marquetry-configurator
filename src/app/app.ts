import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EditorComponent } from './features/editor/editor.component';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EditorComponent],
  template: '<app-editor />',
  styles: ':host { display: block; height: 100%; }',
})
export class App {}
