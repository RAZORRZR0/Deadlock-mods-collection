"use strict";
/// <reference path="citadel.d.ts" />
var Async;
(function (Async) {
    /**
     * Returns a `Promise` that will resolve after `fDelay` seconds.
     */
    function Delay(fDelay) {
        return new Promise(resolve => $.Schedule(fDelay, () => resolve()));
    }
    Async.Delay = Delay;
    /**
     * Returns a `Promise` that will resolve during the next frame.
     */
    function NextFrame() {
        return Delay(0.0);
    }
    Async.NextFrame = NextFrame;
    function UnhandledEvent(sEvent, ...opts) {
        let predicate = null;
        if (typeof opts[0] === "function")
            predicate = opts[0];
        else if (opts.length > 0) {
            predicate = function (...args) {
                for (let i = 0; i < opts.length; i++) {
                    const opt = opts[i];
                    const arg = args[i];
                    if (opt !== arg)
                        return false;
                }
                return true;
            };
        }
        return new Promise(resolve => {
            const nHandlerId = $.RegisterForUnhandledEvent(sEvent, function (...args) {
                if (predicate == null || predicate(...args)) {
                    $.UnregisterForUnhandledEvent(sEvent, nHandlerId);
                    resolve(args);
                }
            });
        });
    }
    Async.UnhandledEvent = UnhandledEvent;
    /**
     * A controller object that allows you to abort any process observing the `signal` member.
     */
    class AbortController {
        signal;
        _aborted = false;
        constructor() {
            const controller = this;
            this.signal = { get aborted() { return controller._aborted; } };
        }
        abort() {
            this._aborted = true;
        }
    }
    Async.AbortController = AbortController;
    function Condition(predicate, abortSignal) {
        return new Promise(async (resolve) => {
            while (abortSignal === undefined || !abortSignal.aborted) {
                if (predicate()) {
                    resolve();
                    return;
                }
                await NextFrame();
            }
        });
    }
    Async.Condition = Condition;
    /**
     * Runs the `sequenceFn`, awaiting the result of every yield, and not resuming the `sequenceFn` if `abortSignal` has aborted.
     * Returns a `Promise` that resolve `true` on completion or `false` if `abortSignal` was aborted.
     */
    function RunSequence(sequenceFn, abortSignal) {
        return new Promise(async (resolve) => {
            const generator = sequenceFn(abortSignal || new Async.AbortController().signal);
            let value;
            while (true) {
                const iterResult = await generator.next(value);
                if (iterResult.done) {
                    resolve(true);
                    return;
                }
                value = await iterResult.value;
                if (abortSignal && abortSignal.aborted) {
                    resolve(false);
                    return;
                }
            }
        });
    }
    Async.RunSequence = RunSequence;
    /**
     * Utility class for scheduling relative to a point in time.
     * @example
     * const timestamp = new TimeStamp();
     * await timestamp.Delay( 1 );
     * $.Msg( "1 second later" );
     * await timestamp.Delay( 2 );
     * $.Msg( "2 seconds later" );
     * await timestamp.Delay( 3 );
     * $.Msg( "3 seconds later" );
     */
    class TimeStamp {
        frameTime = $.FrameTime();
        /**
         * Schedule a function to be run later, relative to when this `TimeStamp` was created.
         */
        Schedule(fDelay, fn) {
            const fDelayFromNow = fDelay - ($.FrameTime() - this.frameTime);
            $.Schedule(fDelayFromNow, fn);
        }
        Delay(fDelay, value) {
            return new Promise(resolve => this.Schedule(fDelay, () => resolve(value)));
        }
    }
    Async.TimeStamp = TimeStamp;
    class SequenceController {
        m_promise;
        m_resolve;
        m_reject;
        m_aborted = false;
        m_finished = false;
        m_skipPromise;
        m_skipFn;
        m_skipping = false;
        m_sounds = [];
        constructor() {
            this.m_promise = new Promise((resolve, reject) => {
                this.m_resolve = resolve;
                this.m_reject = reject;
            });
            this.m_skipPromise = new Promise(resolve => this.m_skipFn = resolve);
        }
        GetPromise() {
            return this.m_promise;
        }
        IsFinished() {
            return this.m_finished;
        }
        Finish() {
            this.m_finished = true;
            this.m_resolve();
        }
        IsAborted() {
            return this.m_aborted;
        }
        Abort() {
            this.m_aborted = true;
            this.m_finished = true;
            this.m_reject();
        }
        Skip() {
            if (!this.m_skipping) {
                this.m_skipping = true;
                this.m_skipFn();
            }
        }
        IsSkipping() {
            return this.m_skipping;
        }
        EndSkipping() {
            this.m_skipping = false;
            this.m_skipPromise = new Promise(resolve => this.m_skipFn = resolve);
        }
        async WaitFor(predicate) {
            while (!predicate(this.m_aborted, this.m_skipping))
                await Async.NextFrame();
        }
        Run(action) {
            if (!this.m_aborted)
                action();
        }
        async Delay(fDelay) {
            if (this.m_aborted || this.m_skipping)
                return Promise.resolve();
            await Promise.any([Async.Delay(fDelay), this.m_skipPromise, this.m_promise]);
        }
        UnskippableDelay(fDelay) {
            return Promise.any([Async.Delay(fDelay), this.m_promise]);
        }
    }
    Async.SequenceController = SequenceController;
})(Async || (Async = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXN5bmMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9jb250ZW50L2NpdGFkZWwvcGFub3JhbWEvc2NyaXB0cy9hc3luYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEscUNBQXFDO0FBRXJDLElBQVUsS0FBSyxDQW1SZDtBQW5SRCxXQUFVLEtBQUs7SUFFWDs7T0FFRztJQUNILFNBQWdCLEtBQUssQ0FBRyxNQUFjO1FBRWxDLE9BQU8sSUFBSSxPQUFPLENBQVEsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBRSxDQUFFLENBQUM7SUFDakYsQ0FBQztJQUhlLFdBQUssUUFHcEIsQ0FBQTtJQUVEOztPQUVHO0lBQ0gsU0FBZ0IsU0FBUztRQUVyQixPQUFPLEtBQUssQ0FBRSxHQUFHLENBQUUsQ0FBQztJQUN4QixDQUFDO0lBSGUsZUFBUyxZQUd4QixDQUFBO0lBb0JELFNBQWdCLGNBQWMsQ0FBeUMsTUFBUyxFQUFFLEdBQUcsSUFBVztRQUU1RixJQUFJLFNBQVMsR0FBOEUsSUFBSSxDQUFDO1FBQ2hHLElBQUssT0FBTyxJQUFJLENBQUUsQ0FBQyxDQUFFLEtBQUssVUFBVTtZQUNoQyxTQUFTLEdBQUcsSUFBSSxDQUFFLENBQUMsQ0FBRSxDQUFDO2FBQ3JCLElBQUssSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQ3pCO1lBQ0ksU0FBUyxHQUFHLFVBQVcsR0FBRyxJQUE0QztnQkFFbEUsS0FBTSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQ3JDO29CQUNJLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBRSxDQUFDLENBQUUsQ0FBQztvQkFDdEIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFFLENBQUMsQ0FBRSxDQUFDO29CQUN0QixJQUFLLEdBQUcsS0FB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