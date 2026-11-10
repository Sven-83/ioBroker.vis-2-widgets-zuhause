import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { kreisBuchstabe, kreisGeometrie, kreisLook, kreiseLaufen } from './kreise';

describe('kreise', () => {
    it('shows armed first, then waiting, selected or not', () => {
        assert.equal(kreisLook({ buchstabe: 'W', scharf: true, gewaehlt: false }, true), 'scharf');
        assert.equal(kreisLook({ buchstabe: 'W', scharf: false, gewaehlt: true }, true), 'wartet');
        assert.equal(kreisLook({ buchstabe: 'W', scharf: false, gewaehlt: false }, true), 'aus');
        assert.equal(kreisLook({ buchstabe: 'W', scharf: false, gewaehlt: true }, false), 'gewaehlt');
        assert.equal(kreisLook({ buchstabe: 'W', scharf: undefined, gewaehlt: undefined }, false), 'gewaehlt');
        assert.equal(kreisLook({ buchstabe: 'W', scharf: false, gewaehlt: false }, false), 'aus');
    });

    it('shows a running command of the circle, also while it is still armed (disarming)', () => {
        assert.equal(kreisLook({ buchstabe: 'G', scharf: true, gewaehlt: true, laeuft: true }, false), 'wartet');
        assert.equal(kreisLook({ buchstabe: 'G', scharf: false, gewaehlt: false, laeuft: true }, false), 'wartet');
        assert.equal(kreisLook({ buchstabe: 'G', scharf: true, gewaehlt: true, laeuft: false }, true), 'scharf');
    });

    it('is busy while any circle runs a command', () => {
        const w = { buchstabe: 'W', scharf: true, gewaehlt: true };
        assert.equal(kreiseLaufen([]), false);
        assert.equal(kreiseLaufen([w, { ...w, laeuft: false }]), false);
        assert.equal(kreiseLaufen([w, { ...w, buchstabe: 'G', laeuft: true }]), true);
    });

    it('keeps at most two letters in upper case', () => {
        assert.equal(kreisBuchstabe(' w '), 'W');
        assert.equal(kreisBuchstabe('Garten'), 'GA');
        assert.equal(kreisBuchstabe(''), '');
        assert.equal(kreisBuchstabe(undefined), '');
    });

    it('places the first segment at the top and the letters outside the ring', () => {
        const ring = kreisGeometrie(3, 52, 19, 6.5);
        assert.equal(ring.length, 3);
        const [x, y] = ring[0].letter;
        assert.ok(Math.abs(x - 26) < 0.01, 'first letter centred');
        assert.ok(Math.abs(y - (26 - 25.5)) < 0.01, 'first letter above the ring');
        // second segment to the right of the centre, third to the left
        assert.ok(ring[1].letter[0] > 26 && ring[2].letter[0] < 26);
        assert.equal(kreisGeometrie(9, 52, 19, 6).length, 4);
        assert.equal(kreisGeometrie(0, 52, 19, 6).length, 1);
    });
});
